import { buildClient } from '@datocms/cma-client-browser'
import { DragDropContext, Draggable, DropResult, Droppable } from '@hello-pangea/dnd'
import { RenderFieldExtensionCtx } from 'datocms-plugin-sdk'
import { Canvas, SelectInput, Spinner } from 'datocms-react-ui'
import 'datocms-react-ui/styles.css'
import get from 'lodash/get'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MdDragIndicator } from 'react-icons/md'
import styles from './FilteredDynamicLink.module.css'

type Props = {
  ctx: RenderFieldExtensionCtx
}

type Option = {
  label: string
  value: string
  modelName?: string
  status?: string
}

export type FieldFilterPair = {
  currentRecordField: string
  targetRecordField: string
  ignoreValue?: any
}

const getBlockPath = (fieldPath: string) => {
  const parts = fieldPath.split('.')
  if (parts.length <= 1) return ''
  parts.pop()
  return parts.join('.')
}

const isArrayAsString = (value: any) =>
  typeof value === 'string' && value.trim().startsWith('[') && value.trim().endsWith(']')

const arrayifyValue = (rawValue: any): any[] => {
  if (rawValue === null || rawValue === undefined) {
    return []
  }
  if (Array.isArray(rawValue)) {
    return rawValue
  }
  if (isArrayAsString(rawValue)) {
    try {
      return JSON.parse(rawValue)
    } catch (e) {
      return [rawValue]
    }
  }
  return [rawValue]
}

const shouldIgnoreValue = (rawValue: any, ignoreConfig?: any): boolean => {
  // Normalize strings/primitives to unified representation
  const normalize = (val: any): string => {
    if (val === null) return 'null'
    if (val === undefined) return 'undefined'
    return String(val).trim().toLowerCase()
  }

  // Helper to extract items into a clean array, expanding stringified arrays like "[]" or "['a', 'b']"
  const parseToArray = (val: any): any[] => {
    if (val === null || val === undefined) return []
    if (Array.isArray(val)) return val
    if (typeof val === 'string') {
      const trimmed = val.trim()
      if (trimmed === '[]' || trimmed === '') return []
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        try {
          return JSON.parse(trimmed)
        } catch {
          return [trimmed]
        }
      }
    }
    return [val]
  }

  const rawArray = parseToArray(rawValue)
  const ignoreArray = parseToArray(ignoreConfig)

  // 1. Both are empty (e.g. rawValue is [] and ignoreValue is "[]", [], null, or "")
  if (rawArray.length === 0 && ignoreArray.length === 0) {
    return true
  }

  // 2. Direct equality match for primitive strings, numbers, booleans, 'null', and 'undefined'
  const normalizedRaw = normalize(rawValue)
  const normalizedIgnore = normalize(ignoreConfig)

  if (normalizedRaw === normalizedIgnore) {
    return true
  }

  // 3. Match elements in arrays
  if (rawArray.length > 0 && ignoreArray.length > 0) {
    const normalizedRawItems = rawArray.map(normalize)
    const normalizedIgnoreItems = ignoreArray.map(normalize)

    return normalizedRawItems.some((item) => normalizedIgnoreItems.includes(item))
  }

  return false
}

export const FilteredDynamicLink = ({ ctx }: Props) => {
  const fieldPairs = useMemo<FieldFilterPair[]>(() => {
    const raw = ctx.parameters.fieldPairs
    if (Array.isArray(raw)) return raw
    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw)
      } catch (e) {}
    }

    const legacyCurrent =
      (ctx.parameters.currentRecordField as string) ||
      (ctx.parameters.filterByField as string) ||
      'site'
    const legacyTarget = (ctx.parameters.targetRecordField as string) || legacyCurrent

    return [{ currentRecordField: legacyCurrent, targetRecordField: legacyTarget }]
  }, [ctx.parameters])

  const activeFilters = useMemo(() => {
    const blockPath = getBlockPath(ctx.fieldPath)

    return fieldPairs.map((pair) => {
      let rawValue: any
      const rawField = pair.currentRecordField?.trim() || ''

      // 1. Handle hardcoded static values
      const staticMatch = rawField.match(/^(?:STRING|VALUE)\((.*)\)$/i)

      if (staticMatch) {
        let staticVal: any = staticMatch[1].trim()
        if (/^['"].*['"]$/.test(staticVal)) {
          staticVal = staticVal.slice(1, -1)
        }
        if (staticVal.toLowerCase() === 'null') staticVal = null
        else if (staticVal.toLowerCase() === 'undefined') staticVal = undefined
        else if (staticVal.toLowerCase() === 'true') staticVal = true
        else if (staticVal.toLowerCase() === 'false') staticVal = false

        rawValue = staticVal
      }
      // 2. Resolve path for 'thisBlock.' fields vs top-level fields
      else if (rawField.startsWith('thisBlock.')) {
        const fieldInBlock = rawField.replace('thisBlock.', '')
        const absolutePath = blockPath ? `${blockPath}.${fieldInBlock}` : fieldInBlock
        rawValue = get(ctx.formValues, absolutePath)

        if (rawValue === undefined && blockPath) {
          rawValue = get(ctx.formValues, fieldInBlock)
        }
      }
      // 3. Fallback to reading standard field key
      else {
        rawValue = get(ctx.formValues, rawField)
      }

      // 4. Normalize single items vs arrays
      const isArray = Array.isArray(rawValue)
      const rawArray = arrayifyValue(rawValue)

      // 5. Extract valid IDs / values
      const extractedVal = rawArray
        .map((item: any) => {
          if (typeof item === 'string') return item.trim()
          if (typeof item === 'number') return String(item)
          if (typeof item === 'boolean') return item
          if (typeof item === 'object' && item !== null) {
            if ('id' in item && typeof item.id === 'string') return item.id
            if ('value' in item && typeof item.value === 'string') return item.value
          }
          return null
        })
        .filter(
          (item: string | number | boolean | object): item is string | boolean =>
            item !== null && item !== '',
        )

      // 6. Check ignore criteria against BOTH target and current fields/values
      const isCurrentIgnored = shouldIgnoreValue(rawValue, pair.ignoreValue)
      const isTargetIgnored = shouldIgnoreValue(pair.targetRecordField, pair.ignoreValue)

      const isIgnored = isCurrentIgnored || isTargetIgnored
      const hasValue = extractedVal.length > 0

      return {
        currentField: pair.currentRecordField,
        targetField: pair.targetRecordField,
        value: isArray ? extractedVal : extractedVal[0],
        rawArray: extractedVal,
        isIgnored,
        hasValue,
      }
    })
  }, [ctx.formValues, ctx.fieldPath, fieldPairs])

  const isFilterReady = useMemo(() => {
    return fieldPairs.length > 0 && activeFilters.every((f) => f.hasValue || f.isIgnored)
  }, [fieldPairs, activeFilters])

  const [availableOptions, setAvailableOptions] = useState<Option[]>([])
  const [selectedCards, setSelectedCards] = useState<Option[]>([])
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)

  const optionsCacheRef = useRef<Map<string, Option>>(new Map())

  const isMulti = ctx.field.attributes.field_type === 'links'

  const currentIds = useMemo(() => {
    const rawValue = get(ctx.formValues, ctx.fieldPath)
    if (!rawValue) return []
    const rawArray = arrayifyValue(rawValue)
    return rawArray
      .map((item: any) => {
        if (typeof item === 'string') return item
        if (typeof item === 'object' && item !== null && item.id) return item.id
        return null
      })
      .filter(Boolean) as string[]
  }, [ctx.formValues, ctx.fieldPath])

  const availableOptionIds = useMemo(
    () => new Set(availableOptions.map((o) => o.value)),
    [availableOptions],
  )

  const invalidSelectedIds = useMemo(() => {
    if (!isFilterReady) return new Set<string>()
    return new Set(
      selectedCards.map((c) => c.value).filter((id) => !availableOptionIds.has(id)),
    )
  }, [selectedCards, availableOptionIds, isFilterReady])

  const allowedItemTypeIds = useMemo(() => {
    const validators = ctx.field.attributes.validators as any
    if (validators?.items_item_type?.item_types) {
      return validators.items_item_type.item_types as string[]
    } else if (validators?.item_item_type?.item_types) {
      return validators.item_item_type.item_types as string[]
    }
    return []
  }, [ctx.field.attributes.validators])

  const activeFiltersKey = JSON.stringify(activeFilters)

  useEffect(() => {
    if (allowedItemTypeIds.length === 0) {
      setInitialLoading(false)
      return
    }

    async function loadData() {
      setLoading(true)
      try {
        const client = buildClient({
          apiToken: ctx.currentUserAccessToken!,
        })

        const itemTypes = await client.itemTypes.list()
        const targetTypes = itemTypes.filter((it) => allowedItemTypeIds.includes(it.id))
        const titleFieldsMap = new Map<string, string>()
        const typeNamesMap = new Map<string, string>()

        for (const type of targetTypes) {
          typeNamesMap.set(type.id, type.name)
          if (type.title_field) {
            const field = await client.fields.find(type.title_field.id)
            titleFieldsMap.set(type.id, field.api_key)
          } else {
            titleFieldsMap.set(type.id, 'name')
          }
        }

        let filteredRecords: any[] = []
        if (isFilterReady) {
          const fieldsFilter: Record<string, any> = {}

          activeFilters.forEach((filter) => {
            if (!filter.isIgnored && filter.hasValue) {
              if (Array.isArray(filter.value)) {
                fieldsFilter[filter.targetField] = { any_in: filter.value }
              } else {
                fieldsFilter[filter.targetField] = { eq: filter.value }
              }
            }
          })

          const fetchPromises = allowedItemTypeIds.map((typeId) =>
            client.items
              .list({
                filter: {
                  type: typeId,
                  fields: fieldsFilter,
                },
                nested: true,
              })
              .catch((err) => {
                console.warn(`Skipping model ${typeId} filter query:`, err)
                return []
              }),
          )

          const results = await Promise.all(fetchPromises)
          filteredRecords = results.flat()
        }

        filteredRecords.forEach((record) => {
          const typeId = record.item_type.id
          const titleKey = titleFieldsMap.get(typeId) || 'name'
          const dynamicTitle = record[titleKey] as string
          optionsCacheRef.current.set(record.id, {
            value: record.id,
            label:
              dynamicTitle ||
              (record.heading as string) ||
              (record.title as string) ||
              (record.name as string) ||
              record.id,
            modelName: typeNamesMap.get(typeId),
            status: record.meta?.status as string,
          })
        })

        const missingIds = currentIds.filter((id) => !optionsCacheRef.current.has(id))

        if (missingIds.length > 0) {
          const fetchMissingPromises = allowedItemTypeIds.map((typeId) =>
            client.items
              .list({
                filter: {
                  type: typeId,
                  ids: missingIds.join(','),
                },
                nested: true,
              })
              .catch(() => []),
          )

          const missingResults = await Promise.all(fetchMissingPromises)
          const missingRecords = missingResults.flat()

          missingRecords.forEach((record) => {
            const typeId = record.item_type.id
            const titleKey = titleFieldsMap.get(typeId) || 'name'
            const dynamicTitle = record[titleKey] as string
            optionsCacheRef.current.set(record.id, {
              value: record.id,
              label:
                dynamicTitle ||
                (record.heading as string) ||
                (record.title as string) ||
                (record.name as string) ||
                record.id,
              modelName: typeNamesMap.get(typeId),
              status: record.meta?.status as string,
            })
          })
        }

        const dropdownOptions: Option[] = filteredRecords.map(
          (r) => optionsCacheRef.current.get(r.id)!,
        )
        const orderedCards: Option[] = currentIds
          .map((id) => optionsCacheRef.current.get(id))
          .filter(Boolean) as Option[]

        setAvailableOptions(dropdownOptions)
        setSelectedCards(orderedCards)
      } catch (err) {
        console.error('Failed to load filtered records:', err)
      } finally {
        setLoading(false)
        setInitialLoading(false)
      }
    }

    loadData()
  }, [isFilterReady, activeFiltersKey, allowedItemTypeIds, ctx.currentUserAccessToken])

  const handleSingleChange = useCallback(
    (newValue: any) => {
      const selected = Array.isArray(newValue) ? newValue[0] : (newValue as Option | null)
      const payload = selected ? selected.value : null

      if (selected) {
        setSelectedCards([selected])
      } else {
        setSelectedCards([])
      }

      ctx.setFieldValue(ctx.fieldPath, payload)
    },
    [ctx],
  )

  const selectableOptions = useMemo(() => {
    const selectedSet = new Set(selectedCards.map((c) => c.value))
    return availableOptions.filter((opt) => !selectedSet.has(opt.value))
  }, [availableOptions, selectedCards])

  const handleAddItem = useCallback(
    (selectedOption: any) => {
      if (!selectedOption) return

      const newSelected = [...selectedCards, selectedOption]
      setSelectedCards(newSelected)

      const updatedIds = newSelected.map((item) => item.value)
      ctx.setFieldValue(ctx.fieldPath, updatedIds)
    },
    [selectedCards, ctx],
  )

  const handleRemoveItem = useCallback(
    (idToRemove: string) => {
      const newSelected = selectedCards.filter((item) => item.value !== idToRemove)
      setSelectedCards(newSelected)

      const updatedIds = newSelected.map((item) => item.value)
      ctx.setFieldValue(ctx.fieldPath, updatedIds)
    },
    [selectedCards, ctx],
  )

  const handleDragEnd = useCallback(
    (result: DropResult) => {
      if (!result.destination) return

      const items = Array.from(selectedCards)
      const [reorderedItem] = items.splice(result.source.index, 1)
      items.splice(result.destination.index, 0, reorderedItem)

      setSelectedCards(items)

      const updatedIds = items.map((item) => item.value)
      ctx.setFieldValue(ctx.fieldPath, updatedIds)
    },
    [selectedCards, ctx],
  )

  const singleSelectedValue =
    selectedCards[0] ||
    availableOptions.find((opt) => opt.value === currentIds[0]) ||
    (currentIds[0] ? { label: `ID: ${currentIds[0]}`, value: currentIds[0] } : null)

  const missingFieldsNames = useMemo(() => {
    return activeFilters
      .filter((f) => !f.hasValue && !f.isIgnored)
      .map((f) => f.currentField)
  }, [activeFilters])

  const isSingleInvalid =
    !isMulti && currentIds[0] && invalidSelectedIds.has(currentIds[0])

  const placeholderText = (() => {
    if (loading) {
      return 'Loading filtered records...'
    }
    if (selectableOptions.length === 0) {
      if (selectedCards.length > 0) {
        return 'All matching records are selected'
      }
      return 'No matching records found'
    }
    return `Search and add record...`
  })()

  console.log(fieldPairs)

  return (
    <Canvas ctx={ctx}>
      {allowedItemTypeIds.length === 0 ?
        <div className={styles.dangerMessage}>
          Please configure the Target Model in the field settings.
        </div>
      : initialLoading && currentIds.length > 0 ?
        <div className={styles.skeletonList}>
          {currentIds.map((id) => (
            <div key={id} className={styles.skeletonItem}>
              <Spinner size={24} />
              <span>Loading item ({id})...</span>
            </div>
          ))}
        </div>
      : !isFilterReady && selectedCards.length === 0 ?
        <div className={styles.mutedMessage}>
          Please complete all required filter fields (
          <strong>{missingFieldsNames.join(', ')}</strong>) first.
        </div>
      : !isMulti ?
        <div className={styles.singleOptionContainer}>
          <div className={isSingleInvalid ? styles.singleSelectError : ''}>
            <SelectInput
              isMulti={false}
              value={singleSelectedValue}
              options={availableOptions}
              onChange={handleSingleChange}
              isSearchable={true}
              isClearable={true}
              placeholder={selectedCards?.[0]?.value ? '' : 'Select link...'}
              controlShouldRenderValue={!selectedCards?.[0]?.value}
              formatOptionLabel={(data) => (
                <div className={styles.dropdownOption}>
                  <span data-status={data?.status} className={styles.indicator} />
                  <span>{data?.label}</span>
                </div>
              )}
            />
            {selectedCards.length === 1 && (
              <div className={styles.optionValue}>
                <span
                  data-status={selectedCards[0].status}
                  className={styles.indicator}
                />
                <span
                  className={styles.selectedOption}
                  onClick={() => {
                    ctx.editItem(selectedCards[0].value)
                  }}
                >
                  {selectedCards[0].label}
                </span>
              </div>
            )}
          </div>
          {isSingleInvalid && (
            <div className={styles.warningMessage}>
              ⚠️ Selected item does not match the active filter parameters.
            </div>
          )}
        </div>
      : <div className={styles.container}>
          <SelectInput
            isMulti={false}
            value={null}
            options={selectableOptions}
            onChange={handleAddItem}
            placeholder={placeholderText}
            isDisabled={selectableOptions.length === 0}
            formatOptionLabel={(data) =>
              data && (
                <div className={styles.dropdownOption}>
                  <span
                    data-status={data?.status || undefined}
                    className={styles.indicator}
                  />
                  <span>{data?.label}</span>
                </div>
              )
            }
          />

          {invalidSelectedIds.size > 0 && (
            <div className={styles.warningMessage}>
              ⚠️ {invalidSelectedIds.size} selected item
              {invalidSelectedIds.size > 1 ? 's' : ''} do
              {invalidSelectedIds.size === 1 ? 'es' : ''} not match the current filter
              criteria.
            </div>
          )}

          {selectedCards.length > 0 && (
            <DragDropContext onDragEnd={handleDragEnd}>
              <Droppable droppableId="filtered-cards-list">
                {(provided) => (
                  <div
                    {...provided.droppableProps}
                    ref={provided.innerRef}
                    className={styles.cardsList}
                  >
                    {selectedCards.map((item, index) => {
                      const isInvalid = invalidSelectedIds.has(item.value)

                      return (
                        <Draggable
                          key={item.value}
                          draggableId={item.value}
                          index={index}
                        >
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              className={`${styles.card} ${
                                snapshot.isDragging ? styles.cardDragging : ''
                              } ${isInvalid ? styles.cardInvalid : ''}`}
                              style={provided.draggableProps.style}
                            >
                              <div className={styles.cardContent}>
                                <div
                                  {...provided.dragHandleProps}
                                  className={styles.dragHandle}
                                  title="Drag to reorder"
                                >
                                  <MdDragIndicator />
                                </div>

                                <button
                                  className={styles.labelGroup}
                                  onClick={() => {
                                    ctx.editItem(item.value)
                                  }}
                                >
                                  <span
                                    className={styles.indicator}
                                    data-status={item.status}
                                  />
                                  <span className={styles.title}>{item.label}</span>
                                </button>
                              </div>

                              <button
                                type="button"
                                onClick={() => handleRemoveItem(item.value)}
                                className={styles.removeButton}
                              >
                                <span className={styles.removeIcon}>×</span>
                              </button>
                            </div>
                          )}
                        </Draggable>
                      )
                    })}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
          )}
        </div>
      }
    </Canvas>
  )
}
