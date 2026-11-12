import { RenderFieldExtensionCtx } from 'datocms-plugin-sdk'
import { useLayoutEffect, useRef } from 'react'
import { AddonParameters } from './ConfigScreen'

import { type ItemMeta } from '@datocms/cma-client/dist/types/generated/RawApiTypes'

const evaluate = (params: AddonParameters, targetValue: unknown): boolean => {
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

  return params.invert ? !matches : matches
}

export const ConditionallyDisabledField = ({ ctx }: { ctx: RenderFieldExtensionCtx }) => {
  const params = ctx.parameters as unknown as AddonParameters
  ctx.setHeight(0)

  const fieldApiKey = ctx.field.attributes.api_key
  const lastApplied = useRef<boolean | null>(null)

  // Compute the result during render so the effect only depends on a primitive
  // boolean, not on ctx.formValues (which changes on every keystroke anywhere).
  const shouldDisable: boolean | null = (() => {
    if (!params?.targetApiKey) return null
    if (params.targetApiKey.startsWith('meta.')) {
      // If item meta is momentarily unavailable, keep the current state.
      if (!ctx.item?.meta) return null
      const targetMetaApiKey = params.targetApiKey.slice(5) as keyof ItemMeta
      return evaluate(params, ctx.item.meta[targetMetaApiKey])
    }
    return evaluate(params, ctx.formValues[params.targetApiKey])
  })()

  useLayoutEffect(() => {
    if (shouldDisable === null) return
    if (lastApplied.current === shouldDisable) return
    lastApplied.current = shouldDisable
    ctx.disableField(fieldApiKey, shouldDisable)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldDisable, fieldApiKey])

  return null
}
