import { RenderManualFieldExtensionConfigScreenCtx } from 'datocms-plugin-sdk'
import { Canvas, Form, TextField } from 'datocms-react-ui'
import React, { useState } from 'react'

interface Props {
  ctx: RenderManualFieldExtensionConfigScreenCtx
}

export const ConfigScreen: React.FC<Props> = ({ ctx }) => {
  // Field-level extension configuration parameters
  const parameters = (ctx.parameters || {}) as { targetModularApiKey?: string }

  const [targetApiKey, setTargetApiKey] = useState<string>(
    parameters.targetModularApiKey || 'content_blocks',
  )

  const handleChange = (newValue: string) => {
    setTargetApiKey(newValue)
    ctx.setParameters({
      targetModularApiKey: newValue,
    })
  }

  return (
    <Canvas ctx={ctx}>
      <Form>
        <TextField
          name="targetModularApiKey"
          id="targetModularApiKey"
          label="Target Modular Content API Key"
          hint="The API key of the target modular content field (e.g., content_blocks)"
          value={targetApiKey}
          onChange={(val) => handleChange(val)}
        />
      </Form>
    </Canvas>
  )
}
