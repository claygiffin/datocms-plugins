import { RenderManualFieldExtensionConfigScreenCtx } from 'datocms-plugin-sdk'
import { Canvas, FieldGroup, TextField } from 'datocms-react-ui'
import 'datocms-react-ui/styles.css'

type Props = {
  ctx: RenderManualFieldExtensionConfigScreenCtx
}

export default function ConfigScreen({ ctx }: Props) {
  const filterByField =
    (ctx.parameters.filterByField as string) || 'school'

  const updateParam = (key: string, value: string) => {
    ctx.setParameters({
      ...ctx.parameters,
      [key]: value,
    })
  }

  return (
    <Canvas ctx={ctx}>
      <FieldGroup>
        <TextField
          name="filterByField"
          id="filterByField"
          label="Filter Field API Key (Current Record)"
          hint="Field on the current record used to filter the target model."
          value={filterByField}
          placeholder="e.g. school"
          onChange={newValue => updateParam('filterByField', newValue)}
        />
      </FieldGroup>
    </Canvas>
  )
}
