import { buildClient } from '@datocms/cma-client-browser'
import { DragDropContext, Draggable, DropResult, Droppable } from '@hello-pangea/dnd'
import { RenderFieldExtensionCtx } from 'datocms-plugin-sdk'
import { Canvas, SelectInput, Spinner } from 'datocms-react-ui'
import 'datocms-react-ui/styles.css'
import get from 'lodash/get'
import { useCallback, useEffect, useMemo, useState } from 'react'
import styles from './FilteredDynamicLink.module.css'

type Props = {
  ctx: RenderFieldExtensionCtx
}

type Option = {
  label: string
  value: string
  modelName?: string
}

export const FilteredDynamicLink = ({ ctx }: Props) => {
  const filterByField = (ctx.parameters.filterByField as string) || 'school'

  const filterValue = get(ctx.formValues, filterByField) as string
  const [availableOptions, setAvailableOptions] = useState<Option[]>([])
  const [selectedCards, setSelectedCards] = useState<Option[]>([])
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)

  // Strictly check if field is 'links' (multi) vs 'link' (single)
  const isMulti = ctx.field.attributes.field_type === 'links'

  // Safely extract primitive string IDs from formValues
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

  const allowedItemTypeIds = useMemo(() => {
    const validators = ctx.field.attributes.validators as any
    if (validators?.items_item_type?.item_types) {
      return validators.items_item_type.item_types as string[]
    } else if (validators?.item_item_type?.item_types) {
      return validators.item_item_type.item_types as string[]
    }
    return []
  }, [ctx.field.attributes.validators])

  // Fetch filtered records for the field
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

        // 1. Fetch FILTERED options for the dropdown
        let filteredRecords: any[] = []
        if (filterValue) {
          filteredRecords = await client.items.list({
            filter: {
              type: allowedItemTypeIds.join(','),
              fields: {
                [filterByField]: { eq: filterValue },
              },
            },
            nested: true,
          })
        }

        // 2. Fetch missing records if they exist in currentIds (e.g. initial load)
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

        // Map options
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

        // Map selected cards in EXACT order of currentIds (used when isMulti = true)
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
    filterValue,
    currentIds.join(','),
    allowedItemTypeIds,
    filterByField,
    ctx.currentUserAccessToken,
  ])

  // --- SINGLE LINK HANDLERS ---
  const handleSingleChange = useCallback(
    (newValue: any) => {
      const selected = Array.isArray(newValue) ? newValue[0] : (newValue as Option | null)
      const payload = selected ? selected.value : null
      ctx.setFieldValue(ctx.fieldPath, payload)
    },
    [ctx],
  )

  // --- MULTI LINK HANDLERS ---
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

  return (
    <Canvas ctx={ctx}>
      {allowedItemTypeIds.length === 0 ?
        <div className={styles.dangerMessage}>
          Please configure the Target Model in the field settings.
        </div>
      : initialLoading && currentIds.length > 0 ?
        /* SKELETON PLACEHOLDER WHILE FETCHING */
        <div className={styles.skeletonList}>
          {currentIds.map((id) => (
            <div key={id} className={styles.skeletonItem}>
              <Spinner size={24} />
              <span>Loading item ({id})...</span>
            </div>
          ))}
        </div>
      : !filterValue && currentIds.length === 0 ?
        <div className={styles.mutedMessage}>
          Please select a valid <strong>{filterByField}</strong> first.
        </div>
      : !isMulti ?
        /* SINGLE LINK VIEW: Classic Select Input */
        <SelectInput
          isMulti={false}
          value={singleSelectedValue}
          options={availableOptions}
          onChange={handleSingleChange}
          placeholder="Select link..."
        />
      : /* MULTI LINK VIEW: Search + Drag and Drop List */
        <div className={styles.container}>
          <SelectInput
            isMulti={false}
            value={null}
            options={selectableOptions}
            onChange={handleAddItem}
            placeholder={
              loading ? 'Loading filtered records...'
              : selectableOptions.length === 0 ?
                'No more matching records found'
              : `Search and add ${filterByField} record...`
            }
          />

          {selectedCards.length > 0 && (
            <DragDropContext onDragEnd={handleDragEnd}>
              <Droppable droppableId="filtered-cards-list">
                {(provided) => (
                  <div
                    {...provided.droppableProps}
                    ref={provided.innerRef}
                    className={styles.cardsList}
                  >
                    {selectedCards.map((item, index) => (
                      <Draggable key={item.value} draggableId={item.value} index={index}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            className={`${styles.card} ${
                              snapshot.isDragging ? styles.cardDragging : ''
                            }`}
                            style={provided.draggableProps.style}
                          >
                            <div className={styles.cardContent}>
                              <div
                                {...provided.dragHandleProps}
                                className={styles.dragHandle}
                                title="Drag to reorder"
                              >
                                <svg
                                  stroke="currentColor"
                                  fill="currentColor"
                                  strokeWidth="0"
                                  viewBox="0 0 24 24"
                                  width="18px"
                                  height="18px"
                                >
                                  <path fill="none" d="M0 0h24v24H0z"></path>
                                  <path d="M11 18c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2m-2-8c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2m0-6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2m6 4c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2m0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2m0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2"></path>
                                </svg>
                              </div>

                              <div className={styles.labelGroup}>
                                <span className={styles.title}>{item.label}</span>
                                {item.modelName && (
                                  <span className={styles.modelName}>
                                    {item.modelName}
                                  </span>
                                )}
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
                    ))}
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
