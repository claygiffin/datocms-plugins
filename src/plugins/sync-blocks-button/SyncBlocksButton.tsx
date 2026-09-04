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

// Generates short unique IDs required by DatoCMS Slate editor keys
const generateSlateId = () => Math.random().toString(36).substring(2, 9)

// Constructs an empty Slate document array expected by DatoCMS form state
const createEmptySlateDocument = () => [
  {
    id: generateSlateId(),
    type: 'paragraph',
    children: [
      {
        text: '',
      },
    ],
  },
]

export const SyncBlocksButton: React.FC<Props> = ({ ctx }) => {
  const [loading, setLoading] = useState<boolean>(false)
  const [syncing, setSyncing] = useState<boolean>(false)
  const [isValid, setIsValid] = useState<boolean | null>(null)

  // Read field-level parameters configured via FieldConfigScreen
  const fieldParameters = (ctx.field.attributes.appearance?.parameters || {}) as {
    targetModularApiKey?: string
  }
  const rawTargetModularApiKey = fieldParameters.targetModularApiKey || 'content_blocks'

  // Split comma-separated API keys into an array
  const targetModularApiKeys = useMemo(
    () =>
      rawTargetModularApiKey
        .split(',')
        .map((key) => key.trim())
        .filter(Boolean),
    [rawTargetModularApiKey],
  )

  // Construct target field path base relative to current field location
  const pathSegments = useMemo(() => ctx.fieldPath.split('.'), [ctx.fieldPath])
  const parentSegments = useMemo(() => pathSegments.slice(0, -1), [pathSegments])

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

  // Compute a stable structural signature string for form blocks
  const blockStructureSignature = useMemo(() => {
    const blockSignatures = targetModularApiKeys.map((apiKey) => {
      const targetModularFieldPath =
        parentSegments.length > 0 ? `${parentSegments.join('.')}.${apiKey}` : apiKey

      const rawCurrentValue = get(ctx.formValues, targetModularFieldPath)
      const rawCurrentArray =
        Array.isArray(rawCurrentValue) ? rawCurrentValue
        : rawCurrentValue ? [rawCurrentValue]
        : []

      return rawCurrentArray.map((block) => {
        if (typeof block === 'object' && block !== null) {
          return {
            id: block.itemId || block.id || null,
            itemTypeId:
              block.itemTypeId ||
              block.item_type ||
              block.item_type?.id ||
              block.itemType ||
              null,
          }
        }
        return { id: block, itemTypeId: null }
      })
    })

    const signature = JSON.stringify(blockSignatures)
    console.log('[SyncBlocks] Computed blockStructureSignature:', signature)
    return signature
  }, [ctx.formValues, targetModularApiKeys, parentSegments])

  // Helper to validate current record structure against template structure
  const validateStructure = useCallback(async () => {
    console.log('[SyncBlocks] START validateStructure()')
    console.log('[SyncBlocks] Initial Context State:', {
      hasAccessToken: Boolean(ctx.currentUserAccessToken),
      templateId,
      targetModularApiKeys,
      parentSegments,
      fieldPath: ctx.fieldPath,
    })

    setLoading(true)

    if (!ctx.currentUserAccessToken || !templateId || targetModularApiKeys.length === 0) {
      console.warn(
        '[SyncBlocks] Validation aborted early due to missing context requirements.',
      )
      setLoading(false)
      return
    }

    try {
      const client = buildClient({ apiToken: ctx.currentUserAccessToken })

      // Fetch all item types upfront for fast sync lookups
      console.log('[SyncBlocks] Fetching all item types...')
      const allItemTypes = await client.itemTypes.list()
      const itemTypeMap = new Map(allItemTypes.map((it) => [it.id, it.api_key]))
      console.log(`[SyncBlocks] Loaded ${allItemTypes.length} item types.`)

      console.log(`[SyncBlocks] Fetching template record ID: ${templateId}`)
      const templateRecord = await client.items.find(templateId)
      console.log('[SyncBlocks] Fetched templateRecord:', templateRecord)

      if (!templateRecord) {
        console.error('[SyncBlocks] Template record not found.')
        setIsValid(false)
        return
      }

      let targetSourceRecord = templateRecord
      if (parentBlockKey) {
        console.log('[SyncBlocks] Nested context detected:', {
          parentBlockKey,
          blockIndexInArray,
        })
        const rawParentBlock = get(templateRecord, parentBlockKey) as
          | string
          | string[]
          | undefined

        const targetParentBlockId =
          Array.isArray(rawParentBlock) ?
            rawParentBlock[blockIndexInArray]
          : rawParentBlock

        console.log(
          `[SyncBlocks] targetParentBlockId resolved to: ${targetParentBlockId}`,
        )

        if (targetParentBlockId) {
          targetSourceRecord = await client.items.find(targetParentBlockId)
          console.log(
            '[SyncBlocks] Fetched nested targetSourceRecord:',
            targetSourceRecord,
          )
        }
      }

      for (const apiKey of targetModularApiKeys) {
        const targetModularFieldPath =
          parentSegments.length > 0 ? `${parentSegments.join('.')}.${apiKey}` : apiKey

        console.log(
          `[SyncBlocks] [Validation] Checking API Key: '${apiKey}' at path: '${targetModularFieldPath}'`,
        )

        const rawTemplateValue = get(targetSourceRecord, apiKey) as
          | string[]
          | string
          | undefined

        const currentFieldValue = get(ctx.formValues, targetModularFieldPath)

        console.log('[SyncBlocks] [Validation] Raw Values:', {
          rawTemplateValue,
          currentFieldValue,
        })

        const isCurrentEmpty =
          currentFieldValue === null ||
          currentFieldValue === undefined ||
          (Array.isArray(currentFieldValue) && currentFieldValue.length === 0)

        const isTemplateEmpty =
          rawTemplateValue === null ||
          rawTemplateValue === undefined ||
          (Array.isArray(rawTemplateValue) && rawTemplateValue.length === 0)

        if (isTemplateEmpty && isCurrentEmpty) {
          console.log(
            `[SyncBlocks] [Validation] Both template and current field are empty for '${apiKey}'. Proceeding.`,
          )
          continue
        }

        if (isTemplateEmpty !== isCurrentEmpty) {
          console.warn(
            `[SyncBlocks] [Validation FAIL] Mismatch in empty states for '${apiKey}'. Template empty: ${isTemplateEmpty}, Current empty: ${isCurrentEmpty}`,
          )
          setIsValid(false)
          return
        }

        const templateBlockIds = (
          Array.isArray(rawTemplateValue) ? rawTemplateValue : [rawTemplateValue]).filter(
          (id): id is string => typeof id === 'string' && id.length > 0,
        )

        console.log(
          `[SyncBlocks] [Validation] Fetching ${templateBlockIds.length} template blocks...`,
          templateBlockIds,
        )
        const templateBlocks = await Promise.all(
          templateBlockIds.map((id) => client.items.find(id)),
        )

        const templateApiKeys = templateBlocks.map(
          (tBlock) => itemTypeMap.get(tBlock.item_type.id) || '',
        )
        console.log('[SyncBlocks] [Validation] Template block API keys:', templateApiKeys)

        const rawCurrentArray =
          Array.isArray(currentFieldValue) ? currentFieldValue
          : currentFieldValue ? [currentFieldValue]
          : []

        if (rawCurrentArray.length !== templateBlocks.length) {
          console.warn(
            `[SyncBlocks] [Validation FAIL] Length mismatch for '${apiKey}'. Current: ${rawCurrentArray.length}, Template: ${templateBlocks.length}`,
          )
          setIsValid(false)
          return
        }

        // Batch fetch unresolved current block items if IDs are passed directly
        const unresolvedIds = rawCurrentArray
          .filter((item) => typeof item === 'string')
          .map((item) => item as string)

        if (unresolvedIds.length > 0) {
          console.log(
            `[SyncBlocks] [Validation] Fetching ${unresolvedIds.length} string-ID current blocks...`,
            unresolvedIds,
          )
        }

        const fetchedItems = await Promise.all(
          unresolvedIds.map((id) => client.items.find(id)),
        )
        const fetchedItemTypeMap = new Map(
          fetchedItems.map((item) => [item.id, item.item_type.id]),
        )

        for (let i = 0; i < rawCurrentArray.length; i++) {
          const currentBlock = rawCurrentArray[i]
          const currentTypeId =
            typeof currentBlock === 'object' && currentBlock !== null ?
              currentBlock.itemTypeId ||
              currentBlock.item_type ||
              (currentBlock.item_type?.id as string)
            : fetchedItemTypeMap.get(currentBlock)

          const currentApiKey = currentTypeId ? itemTypeMap.get(currentTypeId) || '' : ''

          const expectedTemplateKey = templateApiKeys[i]
          const expectedLocalizedKey = `${expectedTemplateKey}_localized`

          console.log(`[SyncBlocks] [Validation] Comparing block index ${i}:`, {
            currentApiKey,
            expectedTemplateKey,
            expectedLocalizedKey,
            currentBlockPayload: currentBlock,
          })

          if (
            currentApiKey !== expectedLocalizedKey &&
            currentApiKey !== expectedTemplateKey
          ) {
            console.warn(
              `[SyncBlocks] [Validation FAIL] Block index ${i} type key mismatch. Found '${currentApiKey}', expected '${expectedTemplateKey}' or '${expectedLocalizedKey}'`,
            )
            setIsValid(false)
            return
          }
        }
      }

      console.log(
        '[SyncBlocks] [Validation SUCCESS] Structure is fully valid and in-sync.',
      )
      setIsValid(true)
    } catch (err) {
      console.error(
        '[SyncBlocks] [Validation ERROR] Unexpected error during validation:',
        err,
      )
      setIsValid(false)
    } finally {
      setLoading(false)
    }
  }, [
    ctx.currentUserAccessToken,
    ctx.formValues,
    templateId,
    parentBlockKey,
    blockIndexInArray,
    targetModularApiKeys,
    parentSegments,
  ])

  useEffect(() => {
    console.log(
      '[SyncBlocks] Effect triggered by templateId or blockStructureSignature change.',
    )
    validateStructure()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, blockStructureSignature])

  const handleSync = async () => {
    console.log('[SyncBlocks] START handleSync()')
    try {
      setSyncing(true)

      if (!ctx.currentUserAccessToken) {
        console.error('[SyncBlocks] [Sync Aborted] Missing user access token.')
        ctx.alert('Missing user access token.')
        return
      }

      if (!templateId) {
        console.error('[SyncBlocks] [Sync Aborted] No template ID.')
        ctx.alert('No template selected on this record.')
        return
      }

      const client = buildClient({ apiToken: ctx.currentUserAccessToken })

      console.log('[SyncBlocks] [Sync] Fetching item types list...')
      const allItemTypes = await client.itemTypes.list()
      const itemTypeMap = new Map(allItemTypes.map((it) => [it.id, it.api_key]))

      console.log(`[SyncBlocks] [Sync] Fetching template record ID: ${templateId}`)
      const templateRecord = await client.items.find(templateId)
      if (!templateRecord) {
        console.error('[SyncBlocks] [Sync Aborted] Template record not found.')
        ctx.alert('Template record not found.')
        return
      }

      let targetSourceRecord = templateRecord
      if (parentBlockKey) {
        console.log('[SyncBlocks] [Sync] Resolving parent block key:', {
          parentBlockKey,
          blockIndexInArray,
        })
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
          console.log(
            '[SyncBlocks] [Sync] Fetched targetSourceRecord:',
            targetSourceRecord,
          )
        }
      }

      for (const apiKey of targetModularApiKeys) {
        const targetModularFieldPath =
          parentSegments.length > 0 ? `${parentSegments.join('.')}.${apiKey}` : apiKey

        console.log(
          `[SyncBlocks] [Sync] Processing target key '${apiKey}' at path '${targetModularFieldPath}'`,
        )

        const rawTemplateValue = get(targetSourceRecord, apiKey) as
          | string[]
          | string
          | undefined

        const isTemplateEmpty =
          rawTemplateValue === null ||
          rawTemplateValue === undefined ||
          (Array.isArray(rawTemplateValue) && rawTemplateValue.length === 0)

        if (isTemplateEmpty) {
          console.log(
            `[SyncBlocks] [Sync] Template key '${apiKey}' is empty. Clearing target field...`,
          )
          const currentVal = get(ctx.formValues, targetModularFieldPath)
          const clearedValue = Array.isArray(currentVal) ? [] : null
          await ctx.setFieldValue(targetModularFieldPath, clearedValue)
          continue
        }

        const templateBlockIds = (
          Array.isArray(rawTemplateValue) ? rawTemplateValue : [rawTemplateValue]).filter(
          (id): id is string => typeof id === 'string' && id.length > 0,
        )

        console.log(
          `[SyncBlocks] [Sync] Fetching ${templateBlockIds.length} template blocks...`,
          templateBlockIds,
        )
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

        console.log(
          '[SyncBlocks] [Sync] Existing current blocks before resolution:',
          rawCurrentArray,
        )

        const currentBlocks = rawCurrentArray.map((block) => {
          if (typeof block === 'object' && block !== null) {
            return {
              id: block.itemId || block.id,
              itemTypeId:
                block.itemTypeId ||
                block.item_type ||
                block.item_type?.id ||
                block.itemType,
              rawObject: block,
            }
          }
          return { id: block, itemTypeId: null, rawObject: null }
        })

        // Resolve missing itemTypeIds in parallel
        const unresolvedBlocks = currentBlocks.filter((b) => !b.itemTypeId)
        if (unresolvedBlocks.length > 0) {
          console.log(
            `[SyncBlocks] [Sync] Resolving missing itemTypeIds for ${unresolvedBlocks.length} blocks via API...`,
          )
        }

        const fetchedCurrentItems = await Promise.all(
          unresolvedBlocks.map((b) => client.items.find(b.id)),
        )
        const fetchedItemTypeMap = new Map(
          fetchedCurrentItems.map((item) => [item.id, item.item_type.id]),
        )

        const resolvedCurrentBlocks = currentBlocks.map((b) => ({
          ...b,
          itemTypeId: b.itemTypeId || fetchedItemTypeMap.get(b.id) || null,
        }))

        console.log(
          '[SyncBlocks] [Sync] Resolved current blocks with itemTypeIds:',
          resolvedCurrentBlocks,
        )

        const remainingCurrentBlocks = [...resolvedCurrentBlocks]
        const synchronizedBlockValues: any[] = []

        for (let idx = 0; idx < templateBlocks.length; idx++) {
          const tBlock = templateBlocks[idx]
          const templateApiKey = itemTypeMap.get(tBlock.item_type.id) || ''
          const expectedLocalizedApiKey = `${templateApiKey}_localized`

          console.log(
            `[SyncBlocks] [Sync Loop Step ${idx}] Target template block type: '${templateApiKey}' (localized: '${expectedLocalizedApiKey}')`,
          )

          let matchIndex = -1

          for (let i = 0; i < remainingCurrentBlocks.length; i++) {
            const currentBlock = remainingCurrentBlocks[i]
            if (currentBlock.itemTypeId) {
              const currentApiKey = itemTypeMap.get(currentBlock.itemTypeId) || ''
              if (currentApiKey === expectedLocalizedApiKey) {
                matchIndex = i
                console.log(
                  `[SyncBlocks] [Sync Loop Step ${idx}] Matched localized model '${expectedLocalizedApiKey}' at current index ${i}`,
                )
                break
              } else if (currentApiKey === templateApiKey && matchIndex === -1) {
                matchIndex = i
                console.log(
                  `[SyncBlocks] [Sync Loop Step ${idx}] Matched standard model '${templateApiKey}' at current index ${i}`,
                )
              }
            }
          }

          if (matchIndex !== -1) {
            const [matchedBlock] = remainingCurrentBlocks.splice(matchIndex, 1)
            const resolvedValue = matchedBlock.rawObject || matchedBlock.id
            console.log(
              `[SyncBlocks] [Sync Loop Step ${idx}] Reusing existing matched block payload:`,
              resolvedValue,
            )
            synchronizedBlockValues.push(resolvedValue)
          } else {
            console.log(
              `[SyncBlocks] [Sync Loop Step ${idx}] No existing block match found. Finding model definition to instantiate...`,
            )
            let targetLocalizedModel = allItemTypes.find(
              (it) => it.api_key === expectedLocalizedApiKey,
            )

            if (!targetLocalizedModel) {
              console.log(
                `[SyncBlocks] [Sync Loop Step ${idx}] Localized model '${expectedLocalizedApiKey}' not found, falling back to '${templateApiKey}'`,
              )
              targetLocalizedModel = allItemTypes.find(
                (it) => it.api_key === templateApiKey,
              )
            }

            if (!targetLocalizedModel) {
              console.error(
                `[SyncBlocks] [Sync ERROR] Could not find block model '${expectedLocalizedApiKey}' or '${templateApiKey}'.`,
              )
              ctx.alert(
                `Could not find block model '${expectedLocalizedApiKey}' or '${templateApiKey}'.`,
              )
              return
            }

            // Construct valid DatoCMS form state object
            const newBlockPayload: Record<string, any> = {
              item_type: targetLocalizedModel.id,
              itemTypeId: targetLocalizedModel.id,
            }

            // Fetch target model fields to seed proper field defaults
            const blockFields = await client.fields.list(targetLocalizedModel.id)

            for (const field of blockFields) {
              // Default localized booleans to true
              if (field.api_key.startsWith('localized_')) {
                newBlockPayload[field.api_key] = true
              }

              // Initialize Structured Text fields with valid Slate JSON nodes
              if (field.field_type === 'structured_text') {
                newBlockPayload[field.api_key] = createEmptySlateDocument()
              }
            }

            console.log(
              `[SyncBlocks] [Sync Loop Step ${idx}] Creating NEW properly-seeded block payload:`,
              newBlockPayload,
            )
            synchronizedBlockValues.push(newBlockPayload)
          }
        }

        const isSingular = !Array.isArray(rawTemplateValue)
        const finalValue =
          isSingular ? synchronizedBlockValues[0] : synchronizedBlockValues

        console.log(
          `[SyncBlocks] [Sync] Applying final computed value to path '${targetModularFieldPath}':`,
          finalValue,
        )
        await ctx.setFieldValue(targetModularFieldPath, finalValue)
        console.log(
          `[SyncBlocks] [Sync] Field path '${targetModularFieldPath}' set successfully.`,
        )
      }

      ctx.notice('Modular blocks successfully synchronized with template!')
      setIsValid(true)
    } catch (err) {
      console.error('[SyncBlocks] [Sync ERROR] Error executing handleSync:', err)
      setIsValid(false)
      ctx.alert('Failed to sync blocks with template.')
    } finally {
      setSyncing(false)
    }
  }

  const currentValue = get(ctx.formValues, ctx.fieldPath) === 'true'
  const isSynced = Boolean(isValid === null ? currentValue : isValid)
  const isDisabled = loading || syncing || isSynced

  const renderIcon = () => {
    if (loading || syncing) return <Spinner size={24} />
    if (isSynced) return <LuCheck size={20} />
    return <LuRefreshCw size={20} />
  }

  const renderLabel = () => {
    if (loading) return 'Loading block data...'
    if (syncing) return 'Syncing blocks...'
    if (isSynced) return 'Blocks are in-sync with template'
    return 'Sync blocks with template'
  }

  useEffect(() => {
    if (currentValue !== isSynced) {
      console.log(
        `[SyncBlocks] Updating field flag at '${ctx.fieldPath}' to '${isSynced.toString()}'`,
      )
      ctx.setFieldValue(ctx.fieldPath, isSynced.toString())
    }
  }, [isSynced, currentValue, ctx.setFieldValue])

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
