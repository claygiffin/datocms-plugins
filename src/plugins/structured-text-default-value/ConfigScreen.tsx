import { RenderManualFieldExtensionConfigScreenCtx } from 'datocms-plugin-sdk'
import { Canvas, Form, TextareaField } from 'datocms-react-ui'

type Props = {
  ctx: RenderManualFieldExtensionConfigScreenCtx
}

export const ConfigScreen = ({ ctx }: Props) => {
  const params = ctx.parameters || {}

  const handleChange = (val: string) => {
    ctx.setParameters({
      ...params,
      defaultMarkdown: val,
    })
  }

  return (
    <Canvas ctx={ctx}>
      <Form>
        <TextareaField
          id="defaultMarkdown"
          name="defaultMarkdown"
          label="Default Content (Markdown)"
          hint="Provide boilerplate content in Markdown format that will populate on new records."
          value={(params.defaultMarkdown as string) || ''}
          onChange={handleChange}
          textareaInputProps={{
            monospaced: true,
            style: { height: '9em' },
          }}
        />
      </Form>
    </Canvas>
  )
}
