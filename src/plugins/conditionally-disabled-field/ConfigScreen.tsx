import { RenderManualFieldExtensionConfigScreenCtx } from 'datocms-plugin-sdk'
import { Canvas, Form, SelectField, SwitchField, TextField } from 'datocms-react-ui'

export interface AddonParameters {
  targetApiKey: string
  operator:
    | 'equals'
    | 'doesNotEqual'
    | 'includes'
    | 'doesNotInclude'
    | 'isEmpty'
    | 'isNotEmpty'
  expectedValue: string
  invert?: boolean
}

const OPERATOR_OPTIONS = [
  { label: 'Equals', value: 'equals' },
  { label: 'Does Not Equal', value: 'doesNotEqual' },
  { label: 'Includes / Contains', value: 'includes' },
  { label: 'Does Not Include', value: 'doesNotInclude' },
  { label: 'Is Empty', value: 'isEmpty' },
  { label: 'Is Not Empty', value: 'isNotEmpty' },
] as const

export const ConfigScreen = ({
  ctx,
}: {
  ctx: RenderManualFieldExtensionConfigScreenCtx
}) => {
  const params = (ctx.parameters || {}) as Partial<AddonParameters>
  const updateParam = (key: keyof AddonParameters, value: unknown) => {
    const updated = {
      ...params,
      [key]: value,
    }

    // Auto-clear expectedValue when operator doesn't use it
    if (key === 'operator' && (value === 'isEmpty' || value === 'isNotEmpty')) {
      updated.expectedValue = ''
    }

    ctx.setParameters(updated)
  }

  const selectedOperator = OPERATOR_OPTIONS.find((o) => o.value === params.operator)
  const hideValueInput = params.operator === 'isEmpty' || params.operator === 'isNotEmpty'

  return (
    <Canvas ctx={ctx}>
      <Form>
        <TextField
          name="targetApiKey"
          id="targetApiKey"
          label="Target Field API Key"
          hint="The API key of the field to watch (e.g. status, show_details)"
          value={params.targetApiKey || ''}
          onChange={(val) => updateParam('targetApiKey', val)}
          required
        />

        <SelectField
          name="operator"
          id="operator"
          label="Comparison Operator"
          value={selectedOperator}
          selectInputProps={{
            options: OPERATOR_OPTIONS,
            isMulti: false,
          }}
          onChange={(opt) =>
            updateParam(
              'operator',
              opt ? (opt as (typeof OPERATOR_OPTIONS)[number]).value : '',
            )
          }
          required
        />

        {!hideValueInput && (
          <TextField
            name="expectedValue"
            id="expectedValue"
            label="Comparison Value"
            hint="String or value to match against (e.g. 'draft', 'true')"
            value={params.expectedValue || ''}
            onChange={(val) => updateParam('expectedValue', val)}
          />
        )}

        <SwitchField
          name="invert"
          id="invert"
          label="Invert Logic"
          hint="Disable field when condition is FALSE instead of TRUE"
          value={Boolean(params.invert)}
          onChange={(val) => updateParam('invert', val)}
        />
      </Form>
    </Canvas>
  )
}
