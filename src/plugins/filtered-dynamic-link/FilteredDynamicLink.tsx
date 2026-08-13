import { buildClient } from '@datocms/cma-client-browser'
import { DragDropContext, Draggable, DropResult, Droppable } from '@hello-pangea/dnd'
import { RenderFieldExtensionCtx } from 'datocms-plugin-sdk'
import { Canvas, SelectInput, Spinner } from 'datocms-react-ui'
import 'datocms-react-ui/styles.css'
import get from 'lodash/get'
import { useCallback, useEffect, useMemo, useState } from 'react'
import styles from './FilteredDynamicLink.module.css'
import { MdDragIndicator } from 'react-icons/md'

type Props = {
  ctx: RenderFieldExtensionCtx
}

type Option = {
  label: string
  value: string
  modelName?: string
}

export type FieldFilterPair = {
  currentRecordField: string
  targetRecordField: string
  ignoreValue?: string | boolean | null
}

const getBlockPath = (fieldPath: string) => {
  const parts = fieldPath.split('.')
  parts.pop()
  return parts.join('.')
}

const shouldIgnoreValue = (
  rawValue: any,
  ignoreConfig?: string | boolean | null,
): boolean => {
  if (ignoreConfig === undefined) return false
  if (ignoreConfig === null) return rawValue === null || rawValue === undefined
  if (typeof ignoreConfig === 'boolean') return rawValue === ignoreConfig
  if (rawValue !== null && rawValue !== undefined) {
    return (
      String(rawValue).trim().toLowerCase() === String(ignoreConfig).trim().toLowerCase()
    )
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
      'school'
    const legacyTarget = (ctx.parameters.targetRecordField as string) || legacyCurrent

    return [{ currentRecordField: legacyCurrent, targetRecordField: legacyTarget }]
  }, [ctx.parameters])

  const activeFilters = useMemo(() => {
    const blockPath = getBlockPath(ctx.fieldPath)

    return fieldPairs.map((pair) => {
      let rawVal: any

      if (pair.currentRecordField.startsWith('thisBlock.')) {
        const fieldInBlock = pair.currentRecordField.replace('thisBlock.', '')
        const absolutePath = blockPath ? `${blockPath}.${fieldInBlock}` : fieldInBlock
        rawVal = get(ctx.formValues, absolutePath)
      } else {
        rawVal = get(ctx.formValues, pair.currentRecordField)
      }

      const extractedVal =
        typeof rawVal === 'object' && rawVal !== null && 'id' in rawVal ?
          rawVal.id
        : rawVal

      const isIgnored = shouldIgnoreValue(extractedVal, pair.ignoreValue)
      const hasValue =
        extractedVal !== undefined && extractedVal !== null && extractedVal !== ''

      return {
        currentField: pair.currentRecordField,
        targetField: pair.targetRecordField,
        value: extractedVal,
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

  const isMulti = ctx.field.attributes.field_type === 'links'

  const currentIds = useMemo(() => {
    const rawValue = get(ctx.formValues, ctx.fieldPath)
    if (!rawValue) return []
    const rawArray = Array.isArray(rawValue) ? rawValue : [rawValue]

    return rawArray
      .map((item: any) => {
        if (typeof item === 'string') return item
        if (typeof item === 'object' && item !== null && item.id) return item.id
        return null
      })
      .filter(Boolean) as string[]
  }, [ctx.formValues, ctx.fieldPath])

  // Track valid IDs from available matching options
  const availableOptionIds = useMemo(
    () => new Set(availableOptions.map((o) => o.value)),
    [availableOptions],
  )

  // Identify which currently selected IDs violate current filter rules
  const invalidSelectedIds = useMemo(() => {
    if (!isFilterReady) return new Set<string>()
    return new Set(currentIds.filter((id) => !availableOptionIds.has(id)))
  }, [currentIds, availableOptionIds, isFilterReady])

  const allowedItemTypeIds = useMemo(() => {
    const validators = ctx.field.attributes.validators as any
    if (validators?.items_item_type?.item_types) {
      return validators.items_item_type.item_types as string[]
    } else if (validators?.item_item_type?.item_types) {
      return validators.item_item_type.item_types as string[]
    }
    return []
  }, [ctx.field.attributes.validators])

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
          const fieldsFilter: Record<string, { eq: any }> = {}

          activeFilters.forEach((filter) => {
            if (!filter.isIgnored && filter.hasValue) {
              fieldsFilter[filter.targetField] = { eq: filter.value }
            }
          })

          filteredRecords = await client.items.list({
            filter: {
              type: allowedItemTypeIds.join(','),
              fields: fieldsFilter,
            },
            nested: true,
          })
        }

        const fetchedIds = new Set(filteredRecords.map((r) => r.id))
        const missingIds = currentIds.filter((id) => !fetchedIds.has(id))

        let missingRecords: any[] = []
        if (missingIds.length > 0) {
          missingRecords = await client.items.list({
            filter: {
              type: allowedItemTypeIds.join(','),
              ids: missingIds.join(','),
            },
            nested: true,
          })
        }

        const allRecords = [...filteredRecords, ...missingRecords]
        const recordsMap = new Map(allRecords.map((r) => [r.id, r]))

        const dropdownOptions: Option[] = filteredRecords.map((record) => {
          const typeId = record.item_type.id
          const titleKey = titleFieldsMap.get(typeId) || 'name'
          const dynamicTitle = record[titleKey] as string
          return {
            value: record.id,
            label:
              dynamicTitle ||
              (record.heading as string) ||
              (record.title as string) ||
              (record.name as string) ||
              record.id,
            modelName: typeNamesMap.get(typeId),
          }
        })

        const orderedCards: Option[] = currentIds
          .map((id) => {
            const record = recordsMap.get(id)
            if (!record) return null
            const typeId = record.item_type.id
            const titleKey = titleFieldsMap.get(typeId) || 'name'
            const dynamicTitle = record[titleKey] as string
            return {
              value: record.id,
              label:
                dynamicTitle ||
                (record.heading as string) ||
                (record.title as string) ||
                (record.name as string) ||
                record.id,
              modelName: typeNamesMap.get(typeId),
            }
          })
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
  }, [
    isFilterReady,
    JSON.stringify(activeFilters),
    currentIds.join(','),
    allowedItemTypeIds,
    ctx.currentUserAccessToken,
  ])

  const handleSingleChange = useCallback(
    (newValue: any) => {
      const selected = Array.isArray(newValue) ? newValue[0] : (newValue as Option | null)
      const payload = selected ? selected.value : null
      ctx.setFieldValue(ctx.fieldPath, payload)
    },
    [ctx],
  )

  const selectableOptions = useMemo(() => {
    const selectedSet = new Set(currentIds)
    return availableOptions.filter((opt) => !selectedSet.has(opt.value))
  }, [availableOptions, currentIds])

  const handleAddItem = useCallback(
    (selectedOption: any) => {
      if (!selectedOption) return
      const addedId = selectedOption.value
      const updated = [...currentIds, addedId]
      ctx.setFieldValue(ctx.fieldPath, updated)
    },
    [currentIds, ctx],
  )

  const handleRemoveItem = useCallback(
    (idToRemove: string) => {
      const updated = currentIds.filter((id) => id !== idToRemove)
      ctx.setFieldValue(ctx.fieldPath, updated)
    },
    [currentIds, ctx],
  )

  const handleDragEnd = useCallback(
    (result: DropResult) => {
      if (!result.destination) return

      const items = Array.from(currentIds)
      const [reorderedId] = items.splice(result.source.index, 1)
      items.splice(result.destination.index, 0, reorderedId)

      ctx.setFieldValue(ctx.fieldPath, items)
    },
    [currentIds, ctx],
  )

  const singleSelectedValue =
    availableOptions.find((opt) => opt.value === currentIds[0]) ||
    selectedCards.find((opt) => opt.value === currentIds[0]) ||
    (currentIds[0] ? { label: `ID: ${currentIds[0]}`, value: currentIds[0] } : null)

  const missingFieldsNames = fieldPairs
    .filter((p) => {
      const active = activeFilters.find((f) => f.currentField === p.currentRecordField)
      return !active || (!active.hasValue && !active.isIgnored)
    })
    .map((p) => p.currentRecordField)

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
      : !isFilterReady && currentIds.length === 0 ?
        <div className={styles.mutedMessage}>
          Please complete all required filter fields (
          <strong>{missingFieldsNames.join(', ')}</strong>) first.
        </div>
      : !isMulti ?
        <div>
          <div className={isSingleInvalid ? styles.singleSelectError : ''}>
            <SelectInput
              isMulti={false}
              value={singleSelectedValue}
              options={availableOptions}
              onChange={handleSingleChange}
              placeholder="Select link..."
            />
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
          />

          {invalidSelectedIds.size > 0 && (
            <div className={styles.warningMessage}>
              ⚠️ {invalidSelectedIds.size} selected item(s) do not match the current
              filter criteria.
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

                                <div className={styles.labelGroup}>
                                  <span className={styles.title}>{item.label}</span>
                                  {/* {item.modelName && (
                                    <span className={styles.modelName}>
                                      {item.modelName}
                                    </span>
                                  )} */}
                                </div>
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
