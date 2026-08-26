import { RenderFieldExtensionCtx } from 'datocms-plugin-sdk'
import { useEffect } from 'react'
import { AddonParameters } from './ConfigScreen'

export const ConditionallyDisabledField = ({ ctx }: { ctx: RenderFieldExtensionCtx }) => {
  const params = ctx.parameters as unknown as AddonParameters

  useEffect(() => {
    if (!params?.targetApiKey) return

    const targetValue = ctx.formValues[params.targetApiKey]
    let matches = false

    switch (params.operator) {
      case 'equals':
        matches = String(targetValue) === String(params.expectedValue)
        break
      case 'doesNotEqual':
        matches = String(targetValue) !== String(params.expectedValue)
        break
      case 'includes':
        matches =
          Array.isArray(targetValue) ?
            targetValue.includes(params.expectedValue)
          : String(targetValue || '').includes(String(params.expectedValue || ''))
        break
      case 'doesNotInclude':
        matches =
          Array.isArray(targetValue) ?
            !targetValue.includes(params.expectedValue)
          : !String(targetValue || '').includes(String(params.expectedValue || ''))
        break
      case 'isEmpty':
        matches = targetValue === null || targetValue === undefined || targetValue === ''
        break
      case 'isNotEmpty':
        matches = targetValue !== null && targetValue !== undefined && targetValue !== ''
        break
    }

    const shouldDisable = params.invert ? !matches : matches

    ctx.disableField(ctx.field.attributes.api_key, shouldDisable)
  }, [ctx.formValues, ctx.field.attributes.api_key, params])

  return null
}
