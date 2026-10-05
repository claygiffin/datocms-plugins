import { DragDropContext, Draggable, DropResult, Droppable } from '@hello-pangea/dnd'
import { RenderFieldExtensionCtx } from 'datocms-plugin-sdk'
import { Button, Canvas, TextInput } from 'datocms-react-ui'
import get from 'lodash/get'
import { FormEvent, useState } from 'react'
import { MdDragIndicator } from 'react-icons/md'
import styles from './SortableList.module.css'

interface Props {
  ctx: RenderFieldExtensionCtx
}

export const SortableList = ({ ctx }: Props) => {
  const [inputValue, setInputValue] = useState('')

  // Access current field value from ctx.formValues using ctx.fieldPath
  const rawValue = get(ctx.formValues, ctx.fieldPath)

  // Safely parse JSON array or handle stringified JSON
  let items: string[] = []
  if (Array.isArray(rawValue)) {
    items = rawValue
  } else if (typeof rawValue === 'string' && rawValue.trim() !== '') {
    try {
      const parsed = JSON.parse(rawValue)
      if (Array.isArray(parsed)) {
        items = parsed
      }
    } catch {
      items = []
    }
  }

  const updateFieldValue = (updatedList: string[]) => {
    ctx.setFieldValue(ctx.fieldPath, JSON.stringify(updatedList))
  }

  const handleAddItem = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = inputValue.trim()
    if (!trimmed) return

    // Append to end of list without auto-sorting
    const updatedList = [...items, trimmed]
    updateFieldValue(updatedList)
    setInputValue('')
  }

  const handleRemoveItem = (indexToRemove: number) => {
    const updatedList = items.filter((_, index) => index !== indexToRemove)
    updateFieldValue(updatedList)
  }

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return

    const reorderedList = Array.from(items)
    const [removed] = reorderedList.splice(result.source.index, 1)
    reorderedList.splice(result.destination.index, 0, removed)

    updateFieldValue(reorderedList)
  }

  return (
    <Canvas ctx={ctx}>
      <div className={styles.container}>
        <form onSubmit={handleAddItem} className={styles.form}>
          <TextInput
            className={styles.input}
            placeholder="Type an item and press Enter..."
            value={inputValue}
            onChange={(val) => setInputValue(val)}
            disabled={ctx.disabled}
          />
          <Button
            className={styles.submit}
            type="submit"
            buttonType="primary"
            disabled={ctx.disabled || !inputValue.trim()}
          >
            Add
          </Button>
        </form>

        {items.length > 0 && (
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="sortable-items-list">
              {(provided) => (
                <div
                  {...provided.droppableProps}
                  ref={provided.innerRef}
                  className={styles.list}
                >
                  {items.map((item, index) => (
                    <Draggable
                      key={`${item}-${index}`}
                      draggableId={`${item}-${index}`}
                      index={index}
                      isDragDisabled={ctx.disabled}
                    >
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
                              <MdDragIndicator />
                            </div>
                            <span className={styles.title}>{item}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(index)}
                            className={styles.removeButton}
                            disabled={ctx.disabled}
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
    </Canvas>
  )
}
