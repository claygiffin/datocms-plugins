import { RenderManualFieldExtensionConfigScreenCtx } from 'datocms-plugin-sdk'
import { Canvas, FieldGroup, TextField, Button } from 'datocms-react-ui'
import 'datocms-react-ui/styles.css'
import { useState } from 'react'

export type FieldFilterPair = {
  currentRecordField: string
  targetRecordField: string
  ignoreValue?: string | boolean | null
}

type Props = {
  ctx: RenderManualFieldExtensionConfigScreenCtx
}

// Helper to convert typed stored parameters into string representation for input fields
const formatValueForInput = (val: string | boolean | null | undefined): string => {
  if (val === null) return 'null'
  if (val === true) return 'true'
  if (val === false) return 'false'
  if (val === undefined) return ''
  return String(val)
}

// Helper to parse typed JavaScript primitives from user input string
const parseInputToTypedValue = (val: string): string | boolean | null | undefined => {
  const trimmed = val.trim()
  if (trimmed === '') return undefined
  if (trimmed.toLowerCase() === 'null') return null
  if (trimmed.toLowerCase() === 'true') return true
  if (trimmed.toLowerCase() === 'false') return false
  return trimmed // Return as string (e.g. "All")
}

export const ConfigScreen = ({ ctx }: Props) => {
  const getInitialPairs = (): FieldFilterPair[] => {
    try {
      const raw = ctx.parameters.fieldPairs
      if (Array.isArray(raw)) return raw
      if (typeof raw === 'string') return JSON.parse(raw)
    } catch (e) {}

    return [
      {
        currentRecordField: 'thisBlock.faculty_type',
        targetRecordField: 'faculty_type',
        ignoreValue: 'All',
      },
    ]
  }

  const [pairs, setPairs] = useState<FieldFilterPair[]>(getInitialPairs)

  const updatePairs = (newPairs: FieldFilterPair[]) => {
    setPairs(newPairs)
    ctx.setParameters({
      ...ctx.parameters,
      fieldPairs: newPairs,
    })
  }

  const handleFieldChange = (
    index: number,
    key: keyof FieldFilterPair,
    rawValue: string,
  ) => {
    const updated = [...pairs]

    if (key === 'ignoreValue') {
      updated[index][key] = parseInputToTypedValue(rawValue)
    } else {
      updated[index][key] = rawValue as any
    }

    updatePairs(updated)
  }

  const handleAddPair = () => {
    updatePairs([
      ...pairs,
      { currentRecordField: '', targetRecordField: '', ignoreValue: undefined },
    ])
  }

  const handleRemovePair = (index: number) => {
    const updated = pairs.filter((_, i) => i !== index)
    updatePairs(updated)
  }

  return (
    <Canvas ctx={ctx}>
      <FieldGroup>
        {pairs.map((pair, index) => (
          <div
            key={index}
            style={{
              display: 'flex',
              gap: '12px',
              alignItems: 'flex-start',
              marginBottom: '16px',
              paddingBottom: '16px',
              borderBottom: '1px solid #e0e0e0',
            }}
          >
            <div style={{ flex: 1 }}>
              <TextField
                name={`currentRecordField_${index}`}
                id={`currentRecordField_${index}`}
                label={`Rule ${index + 1}: Current API Key`}
                value={pair.currentRecordField}
                placeholder="e.g. thisBlock.faculty_type"
                onChange={(val) => handleFieldChange(index, 'currentRecordField', val)}
              />
            </div>

            <div style={{ flex: 1 }}>
              <TextField
                name={`targetRecordField_${index}`}
                id={`targetRecordField_${index}`}
                label="Target Model API Key"
                value={pair.targetRecordField}
                placeholder="e.g. faculty_type"
                onChange={(val) => handleFieldChange(index, 'targetRecordField', val)}
              />
            </div>

            <div style={{ width: '220px' }}>
              <TextField
                name={`ignoreValue_${index}`}
                id={`ignoreValue_${index}`}
                label="Ignore value"
                value={formatValueForInput(pair.ignoreValue)}
                placeholder="All / true / null"
                onChange={(val) => handleFieldChange(index, 'ignoreValue', val)}
                textInputProps={{
                  style: {
                    fontFamily:
                      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                    fontSize: '13px',
                  },
                }}
              />
            </div>

            {pairs.length > 1 && (
              <Button
                buttonType="negative"
                onClick={() => handleRemovePair(index)}
                style={{ marginTop: '24px' }}
              >
                Remove
              </Button>
            )}
          </div>
        ))}

        <Button buttonType="muted" onClick={handleAddPair}>
          + Add Filter Rule
        </Button>
      </FieldGroup>
    </Canvas>
  )
}
