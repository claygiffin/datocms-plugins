import { buildClient } from '@datocms/cma-client-browser'
import { RenderFieldExtensionCtx } from 'datocms-plugin-sdk'
import { Canvas } from 'datocms-react-ui'
import get from 'lodash/get'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { LuGlobe, LuMapPin } from 'react-icons/lu'
import styles from './LocalizedBoolean.module.css'
import { findLastIndex } from 'lodash'

interface Props {
  ctx: RenderFieldExtensionCtx
}

export const LocalizedBoolean: React.FC<Props> = ({ ctx }) => {
  const [loading, setLoading] = useState<boolean>(true)
  // const [refreshTrigger, setRefreshTrigger] = useState<number>(0)

  const currentFieldKey = ctx.field.attributes.api_key
  const currentValue = Boolean(get(ctx.formValues, ctx.fieldPath))

  // Derive neighbor field name & full field path (e.g. "localized_heading" -> "heading")
  const targetFieldName = currentFieldKey.replace('localized_', '')
  const pathParts = ctx.fieldPath.split('.')
  pathParts[pathParts.length - 1] = targetFieldName
  const targetFieldPath = pathParts.join('.')

  const pathSegments = ctx.fieldPath.split('.')
  const parentSegments = pathSegments.slice(0, -1) // Drops the field key at the end

  const parentBlockIndexInPath = findLastIndex(parentSegments, (segment) =>
    isNaN(Number(segment)),
  )

  const parentBlockKey =
    parentBlockIndexInPath !== -1 ? parentSegments[parentBlockIndexInPath] : undefined

  const nextSegment =
    parentBlockIndexInPath !== -1 ? parentSegments[parentBlockIndexInPath + 1] : undefined
  const blockIndexInArray =
    nextSegment && !isNaN(Number(nextSegment)) ? Number(nextSegment) : 0

  const templateId = get(ctx.formValues, 'template') as string | undefined

  const globalFieldValue = useRef('')

  const syncFromTemplate = useCallback(async () => {
    try {
      setLoading(true)

      if (!ctx.currentUserAccessToken) {
        console.error('currentUserAccessToken missing in ctx')
        return
      }

      if (!templateId || !parentBlockKey) return

      const client = buildClient({
        apiToken: ctx.currentUserAccessToken,
      })

      // 1. Fetch template record using client
      const templateRecord = await client.items.find(templateId)
      if (!templateRecord) return

      // 2. Fetch target block ID (supports both single string ID or array of IDs)
      const rawBlockValue = get(templateRecord, parentBlockKey) as
        | string
        | string[]
        | undefined
      if (!rawBlockValue) return

      let targetBlockId: string | undefined

      if (Array.isArray(rawBlockValue)) {
        // Multiple Modular Block: pick the block ID matching current array index
        targetBlockId = rawBlockValue[blockIndexInArray]
      } else {
        // Single Modular Block
        targetBlockId = rawBlockValue
      }

      if (!targetBlockId) return

      // 3. Fetch the target block record
      const templateBlock = await client.items.find(targetBlockId)
      const templateFieldIsLocalized = Boolean(get(templateBlock, currentFieldKey))

      if (typeof templateBlock[targetFieldName] === 'string') {
        globalFieldValue.current = templateBlock[targetFieldName]
      }
      if (!templateFieldIsLocalized && targetFieldName === 'heading') {
        ctx.setFieldValue(targetFieldPath, templateBlock['heading'])
      }

      // 4. Extract boolean value and sync to current field
      if (templateFieldIsLocalized !== currentValue) {
        await ctx.setFieldValue(ctx.fieldPath, templateFieldIsLocalized)
      }
    } catch (error) {
      console.error('Error computing template boolean value:', error)
    } finally {
      setLoading(false)
    }
  }, [
    templateId,
    blockIndexInArray,
    ctx.currentUserAccessToken,
    currentFieldKey,
    currentValue,
    parentBlockKey,
  ])

  useEffect(() => {
    syncFromTemplate()
  }, [syncFromTemplate])

  // Keep neighbor field visibility in sync
  useEffect(() => {
    ctx.toggleField(targetFieldPath, currentValue)
  }, [currentValue, targetFieldPath, ctx])

  return (
    <Canvas ctx={ctx}>
      <div className={styles.container} data-loading={loading}>
        <div className={styles.icon}>
          {currentValue ?
            <LuMapPin />
          : <LuGlobe />}
        </div>
        <label className={styles.label} htmlFor={currentFieldKey}>
          <span>{currentValue ? 'Localized' : 'Global'}</span>
        </label>
        {!currentValue && globalFieldValue.current && (
          <span className={styles.preview}>{globalFieldValue.current}</span>
        )}
      </div>
    </Canvas>
  )
}
