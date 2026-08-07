import { buildClient } from '@datocms/cma-client-browser'
import { RenderFieldExtensionCtx } from 'datocms-plugin-sdk'
import { Button, Canvas, Form, Spinner } from 'datocms-react-ui'
import findLastIndex from 'lodash/findLastIndex'
import get from 'lodash/get'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { LuCheck, LuRefreshCw } from 'react-icons/lu'
import styles from './SyncBlocksButton.module.css'

interface Props {
  ctx: RenderFieldExtensionCtx
}

export const SyncBlocksButton: React.FC<Props> = ({ ctx }) => {
  const [loading, setLoading] = useState<boolean>(false)
  const [isValid, setIsValid] = useState<boolean | null>(null)

  // Read field-level parameters configured via FieldConfigScreen
  const fieldParameters = (ctx.field.attributes.appearance?.parameters || {}) as {
    targetModularApiKey?: string
  }
  const targetModularApiKey = fieldParameters.targetModularApiKey || 'content_blocks'

  // Construct target field path relative to current field location
  const pathSegments = ctx.fieldPath.split('.')
  const parentSegments = pathSegments.slice(0, -1)

  const parentBlockIndexInPath = findLastIndex(parentSegments, (segment) =>
    isNaN(Number(segment)),
  )
  const parentBlockKey =
    parentBlockIndexInPath !== -1 ? parentSegments[parentBlockIndexInPath] : undefined

  const nextSegment =
    parentBlockIndexInPath !== -1 ? parentSegments[parentBlockIndexInPath + 1] : undefined
  const blockIndexInArray =
    nextSegment && !isNaN(Number(nextSegment)) ? Number(nextSegment) : 0

  let targetModularFieldPath = ''
  if (parentSegments.length > 0) {
    targetModularFieldPath = `${parentSegments.join('.')}.${targetModularApiKey}`
  } else {
    targetModularFieldPath = targetModularApiKey
  }

  const templateId = get(ctx.formValues, 'template') as string | undefined
  const currentFieldValue = get(ctx.formValues, targetModularFieldPath)
  const rawCurrentArray =
    Array.isArray(currentFieldValue) ? currentFieldValue
    : currentFieldValue ? [currentFieldValue]
    : []
  const currentArray = useMemo(
    () => rawCurrentArray.map((item) => ({ itemTypeId: item.itemTypeId as string })),
    [rawCurrentArray],
  )
  // Helper to validate current record structure against template structure
  const validateStructure = useCallback(async () => {
    if (!ctx.currentUserAccessToken || !templateId) {
      setIsValid(null)
      return
    }

    try {
      const client = buildClient({ apiToken: ctx.currentUserAccessToken })

      // Cache itemType api_keys during execution
      const itemTypeApiKeyCache = new Map<string, string>()
      const getItemTypeApiKey = async (itemTypeId: string): Promise<string> => {
        if (itemTypeApiKeyCache.has(itemTypeId)) {
          return itemTypeApiKeyCache.get(itemTypeId)!
        }
        const itemType = await client.itemTypes.find(itemTypeId)
        itemTypeApiKeyCache.set(itemTypeId, itemType.api_key)
        return itemType.api_key
      }

      // 1. Fetch template record
      const templateRecord = await client.items.find(templateId)
      if (!templateRecord) return

      // 2. Resolve target record from template
      let targetSourceRecord = templateRecord
      if (parentBlockKey) {
        const rawParentBlock = get(templateRecord, parentBlockKey) as
          | string
          | string[]
          | undefined

        const targetParentBlockId =
          Array.isArray(rawParentBlock) ?
            rawParentBlock[blockIndexInArray]
          : rawParentBlock

        if (targetParentBlockId) {
          targetSourceRecord = await client.items.find(targetParentBlockId)
        }
      }

      // 3. Extract template block IDs
      const rawTemplateValue = get(targetSourceRecord, targetModularApiKey) as
        | string[]
        | string
        | undefined

      if (!rawTemplateValue) {
        setIsValid(false)
        return
      }

      const templateBlockIds: string[] =
        Array.isArray(rawTemplateValue) ? rawTemplateValue : [rawTemplateValue]

      const templateBlocks = await Promise.all(
        templateBlockIds.map((id) => client.items.find(id)),
      )

      const templateApiKeys: string[] = []
      for (const tBlock of templateBlocks) {
        const apiKey = await getItemTypeApiKey(tBlock.item_type.id)
        templateApiKeys.push(apiKey)
      }

      // 4. Validate current record form state against template structure

      if (currentArray.length !== templateBlocks.length) {
        setIsValid(false)
        return
      }

      let matches = true
      for (let i = 0; i < currentArray.length; i++) {
        const currentBlock = currentArray[i]
        const currentTypeId =
          typeof currentBlock === 'object' && currentBlock !== null ?
            currentBlock.itemTypeId
          : null

        let currentApiKey = ''
        if (currentTypeId) {
          currentApiKey = await getItemTypeApiKey(currentTypeId)
        } else if (typeof currentBlock === 'string') {
          const fetchedItem = await client.items.find(currentBlock)
          currentApiKey = await getItemTypeApiKey(fetchedItem.item_type.id)
        }

        const expectedTemplateKey = templateApiKeys[i]
        const expectedLocalizedKey = `${expectedTemplateKey}_localized`

        if (
          currentApiKey !== expectedLocalizedKey &&
          currentApiKey !== expectedTemplateKey
        ) {
          matches = false
          break
        }
      }

      setIsValid(matches)
    } catch (err) {
      console.error('Error validating template structure:', err)
      setIsValid(false)
    }
  }, [
    ctx.currentUserAccessToken,
    templateId,
    parentBlockKey,
    blockIndexInArray,
    targetModularApiKey,
    currentArray,
  ])

  // Run validation on mount and whenever template/form state changes
  useEffect(() => {
    validateStructure()
  }, [validateStructure])

  const handleSync = async () => {
    try {
      setLoading(true)

      if (!ctx.currentUserAccessToken) {
        ctx.alert('Missing user access token.')
        return
      }

      if (!templateId) {
        ctx.alert('No template selected on this record.')
        return
      }

      const client = buildClient({
        apiToken: ctx.currentUserAccessToken,
      })

      const itemTypeApiKeyCache = new Map<string, string>()
      const getItemTypeApiKey = async (itemTypeId: string): Promise<string> => {
        if (itemTypeApiKeyCache.has(itemTypeId)) {
          return itemTypeApiKeyCache.get(itemTypeId)!
        }
        const itemType = await client.itemTypes.find(itemTypeId)
        itemTypeApiKeyCache.set(itemTypeId, itemType.api_key)
        return itemType.api_key
      }

      const templateRecord = await client.items.find(templateId)
      if (!templateRecord) {
        ctx.alert('Template record not found.')
        return
      }

      let targetSourceRecord = templateRecord
      if (parentBlockKey) {
        const rawParentBlock = get(templateRecord, parentBlockKey) as
          | string
          | string[]
          | undefined

        const targetParentBlockId =
          Array.isArray(rawParentBlock) ?
            rawParentBlock[blockIndexInArray]
          : rawParentBlock

        if (targetParentBlockId) {
          targetSourceRecord = await client.items.find(targetParentBlockId)
        }
      }

      const rawTemplateValue = get(targetSourceRecord, targetModularApiKey) as
        | string[]
        | string
        | undefined

      if (!rawTemplateValue) {
        ctx.alert(`Selected template has no blocks in '${targetModularApiKey}'.`)
        return
      }

      const templateBlockIds: string[] =
        Array.isArray(rawTemplateValue) ? rawTemplateValue : [rawTemplateValue]

      const templateBlocks = await Promise.all(
        templateBlockIds.map((id) => client.items.find(id)),
      )

      const rawCurrentValue = get(ctx.formValues, targetModularFieldPath) as
        | any[]
        | any
        | undefined

      const rawCurrentArray =
        Array.isArray(rawCurrentValue) ? rawCurrentValue
        : rawCurrentValue ? [rawCurrentValue]
        : []

      const currentBlocks = rawCurrentArray.map((block) => {
        if (typeof block === 'object' && block !== null) {
          return {
            id: block.itemId || block.id,
            itemTypeId: block.itemTypeId || block.item_type?.id || block.itemType,
            rawObject: block,
          }
        }
        return { id: block, itemTypeId: null, rawObject: null }
      })

      const resolvedCurrentBlocks = await Promise.all(
        currentBlocks.map(async (block) => {
          if (block.itemTypeId) return block

          const fetchedItem = await client.items.find(block.id)
          return {
            id: fetchedItem.id,
            itemTypeId: fetchedItem.item_type.id,
            rawObject: null,
          }
        }),
      )

      const allItemTypes = await client.itemTypes.list()
      const remainingCurrentBlocks = [...resolvedCurrentBlocks]
      const synchronizedBlockValues: any[] = []

      for (let idx = 0; idx < templateBlocks.length; idx++) {
        const tBlock = templateBlocks[idx]
        const templateApiKey = await getItemTypeApiKey(tBlock.item_type.id)
        const expectedLocalizedApiKey = `${templateApiKey}_localized`

        let matchIndex = -1

        for (let i = 0; i < remainingCurrentBlocks.length; i++) {
          const currentBlock = remainingCurrentBlocks[i]
          if (currentBlock.itemTypeId) {
            const currentApiKey = await getItemTypeApiKey(currentBlock.itemTypeId)
            if (currentApiKey === expectedLocalizedApiKey) {
              matchIndex = i
              break
            } else if (currentApiKey === templateApiKey && matchIndex === -1) {
              matchIndex = i
            }
          }
        }

        if (matchIndex !== -1) {
          const [matchedBlock] = remainingCurrentBlocks.splice(matchIndex, 1)
          synchronizedBlockValues.push(matchedBlock.rawObject || matchedBlock.id)
        } else {
          let targetLocalizedModel = allItemTypes.find(
            (it) => it.api_key === expectedLocalizedApiKey,
          )

          if (!targetLocalizedModel) {
            targetLocalizedModel = allItemTypes.find(
              (it) => it.api_key === templateApiKey,
            )
          }

          if (!targetLocalizedModel) {
            ctx.alert(
              `Could not find block model '${expectedLocalizedApiKey}' or '${templateApiKey}'.`,
            )
            return
          }

          const newInMemBlock = {
            itemTypeId: targetLocalizedModel.id,
          }

          synchronizedBlockValues.push(newInMemBlock)
        }
      }

      const isSingular = !Array.isArray(rawTemplateValue)
      const finalValue = isSingular ? synchronizedBlockValues[0] : synchronizedBlockValues

      await ctx.setFieldValue(targetModularFieldPath, finalValue)
      ctx.notice('Modular blocks successfully synchronized with template!')

      await validateStructure()
    } catch (err) {
      console.error('Error syncing blocks:', err)
      ctx.alert('Failed to sync blocks with template.')
    } finally {
      setLoading(false)
    }
  }

  // Derive button UI properties based on state
  const isSynced = isValid === true
  const isDisabled = loading || isSynced

  const renderIcon = () => {
    if (loading) return <Spinner size={24} />
    if (isSynced) return <LuCheck size={20} />
    return <LuRefreshCw size={20} />
  }

  const renderLabel = () => {
    if (loading) return 'Syncing Blocks...'
    if (isSynced) return 'Blocks In Sync with Template'
    return 'Sync Blocks with Template'
  }

  // const currentBoolean = get(ctx.formValues, ctx.fieldPath)
  // useEffect(() => {
  //   if (currentBoolean !== isSynced) {
  //     ctx.setFieldValue(ctx.fieldPath, isSynced)
  //   }
  // }, [currentBoolean, isSynced, ctx.setFieldValue, ctx.fieldPath])

  return (
    <Canvas ctx={ctx}>
      <Form className={styles.form}>
        <Button
          className={styles.button}
          buttonType={'muted'}
          fullWidth
          disabled={isDisabled}
          onClick={handleSync}
        >
          <span className={styles.icon}>{renderIcon()}</span>
          {renderLabel()}
        </Button>
      </Form>
    </Canvas>
  )
}
