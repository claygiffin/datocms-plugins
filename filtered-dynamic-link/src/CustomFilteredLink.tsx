import { buildClient } from '@datocms/cma-client-browser'
import { DragDropContext, Draggable, DropResult, Droppable } from '@hello-pangea/dnd'
import { RenderFieldExtensionCtx } from 'datocms-plugin-sdk'
import { Canvas, SelectInput } from 'datocms-react-ui'
import 'datocms-react-ui/styles.css'
import get from 'lodash/get'
import { useCallback, useEffect, useMemo, useState } from 'react'

type Props = {
  ctx: RenderFieldExtensionCtx
}

type Option = {
  label: string
  value: string
  modelName?: string
}

export default function CustomFilteredLink({ ctx }: Props) {
  const filterByField = (ctx.parameters.filterByField as string) || 'school'

  const filterValue = get(ctx.formValues, filterByField) as string
  const [availableOptions, setAvailableOptions] = useState<Option[]>([])
  const [selectedCards, setSelectedCards] = useState<Option[]>([])
  const [loading, setLoading] = useState(false)

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
    if (allowedItemTypeIds.length === 0) return

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
    null

  return (
    <Canvas ctx={ctx}>
      {allowedItemTypeIds.length === 0 ?
        <div style={{ color: 'var(--color--danger--ink)' }}>
          Please configure the Target Model in the field settings.
        </div>
      : !filterValue && currentIds.length === 0 ?
        <div style={{ color: 'var(--color--ink-muted)' }}>
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
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
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
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}
                  >
                    {selectedCards.map((item, index) => (
                      <Draggable key={item.value} draggableId={item.value} index={index}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            style={{
                              ...provided.draggableProps.style,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '10px 14px',
                              border: '1px solid var(--color--border)',
                              borderRadius: '6px',
                              boxShadow:
                                snapshot.isDragging ?
                                  '0 6px 16px rgba(0,0,0,0.12)'
                                : 'none',
                            }}
                          >
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '12px',
                              }}
                            >
                              <div
                                {...provided.dragHandleProps}
                                style={{
                                  cursor: 'grab',
                                  color: '#888',
                                  display: 'flex',
                                  alignItems: 'center',
                                  userSelect: 'none',
                                }}
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

                              <div
                                style={{
                                  display: 'flex',
                                  flexDirection: 'column',
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: '14px',
                                    fontWeight: 500,
                                    color: 'var(--color--ink)',
                                  }}
                                >
                                  {item.label}
                                </span>
                                {item.modelName && (
                                  <span
                                    style={{
                                      fontSize: '11px',
                                      color: 'var(--color--ink-light)',
                                      textTransform: 'uppercase',
                                      letterSpacing: '0.5px',
                                    }}
                                  >
                                    {item.modelName}
                                  </span>
                                )}
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleRemoveItem(item.value)}
                              style={{
                                position: 'relative',
                                borderRadius: '50%',
                                appearance: 'none',
                                border: 'none',
                                padding: 0,
                                display: 'flex',
                                width: '2em',
                                height: '2em',
                                cursor: 'pointer',
                              }}
                            >
                              <span
                                style={{
                                  position: 'absolute',
                                  display: 'block',
                                  fontSize: '1.25em',
                                  lineHeight: 1,
                                  paddingBottom: '0.15em',
                                  top: '50%',
                                  left: '50%',
                                  transform: 'translate(-50%, -50%)',
                                }}
                              >
                                ×
                              </span>
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
