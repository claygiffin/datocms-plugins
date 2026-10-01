import { RenderFieldExtensionCtx } from 'datocms-plugin-sdk'
import { Button, Canvas, TextInput } from 'datocms-react-ui'
import get from 'lodash/get'
import { FormEvent, useState } from 'react'
import styles from './AlphabeticalList.module.css'

interface Props {
  ctx: RenderFieldExtensionCtx
}

export const AlphabeticalList = ({ ctx }: Props) => {
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

  // Helper function to update DatoCMS form state reliably
  const updateFieldValue = (updatedList: string[]) => {
    // Stringify the JSON payload to ensure strict DatoCMS API compliance
    const serializedValue = JSON.stringify(updatedList)
    ctx.setFieldValue(ctx.fieldPath, serializedValue)
  }

  const handleAddItem = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = inputValue.trim()
    if (!trimmed) return

    // Add item and maintain alphabetical sorting
    const updatedList = [...items, trimmed].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' }),
    )

    updateFieldValue(updatedList)
    setInputValue('')
  }

  const handleRemoveItem = (indexToRemove: number) => {
    const updatedList = items.filter((_, index) => index !== indexToRemove)
    updateFieldValue(updatedList)
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
          <div className={styles.list}>
            {items.map((item, index) => (
              <div key={`${item}-${index}`} className={styles.card}>
                <span className={styles.title}>{item}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveItem(index)}
                  className={styles.removeButton}
                  disabled={ctx.disabled}
                >
                  <span className={styles.removeIcon}>×</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Canvas>
  )
}
