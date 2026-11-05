import { buildClient } from '@datocms/cma-client-browser'
import { connect, RenderItemFormOutletCtx } from 'datocms-plugin-sdk'
import { Canvas } from 'datocms-react-ui'
import { useEffect, useState } from 'react'
import { render } from '../../utils/render' // Standard React plugin mount helper
import 'datocms-react-ui/styles.css'

interface AccessTokenCtx {
  currentUserAccessToken?: string
  environment: string
}

const getSchoolFromRole = (roleName?: string): string | null => {
  if (!roleName) return null
  const match = roleName.match(/^School Editor \((.+)\)$/)
  return match ? match[1] : null
}

const getClient = (ctx: AccessTokenCtx) => {
  if (!ctx.currentUserAccessToken) {
    throw new Error('Plugin is missing the currentUserAccessToken permission')
  }
  return buildClient({
    apiToken: ctx.currentUserAccessToken,
    environment: ctx.environment,
  })
}

const extractSiteName = (record: any): string | undefined => {
  // Flattened CMA response (current cma-client) or raw JSON:API shape
  const value = record?.name ?? record?.attributes?.name
  return typeof value === 'string' ? value : undefined
}

const normalize = (s?: string | null) => s?.trim().toLowerCase() ?? ''

const LOG = '[schoolGuard]'

const checkSchoolPermission = async (
  ctx: RenderItemFormOutletCtx,
): Promise<{ allowed: boolean; reason?: string }> => {
  const roleName = ctx.currentRole?.attributes?.name
  const assignedSchool = getSchoolFromRole(roleName)

  if (!assignedSchool) {
    // console.log(LOG, 'not a School Editor role -> allowed')
    return { allowed: true }
  }

  if (ctx.itemStatus === 'new' || !ctx.item) {
    // console.log(LOG, 'new record -> allowed')
    return { allowed: true }
  }

  const siteId = ctx.formValues.site as string | undefined
  if (!siteId) {
    // console.log(LOG, 'no site linked -> locked')
    return { allowed: false, reason: 'No site linked to this record.' }
  }

  try {
    const client = getClient(ctx)
    const siteRecord = await client.items.find(siteId)
    // console.log(LOG, 'site record from API', siteRecord)

    const siteName = extractSiteName(siteRecord)
    // console.log(LOG, 'compare', { siteName, assignedSchool })

    if (normalize(siteName) === normalize(assignedSchool)) {
      return { allowed: true }
    }
    return {
      allowed: false,
      reason: `Record belongs to "${siteName}", but your role is limited to "${assignedSchool}".`,
    }
  } catch (e) {
    // console.error(LOG, 'site lookup FAILED -> locking', e)
    return { allowed: false, reason: 'Could not verify school.' }
  }
}

const GuardComponent = ({ ctx }: { ctx: RenderItemFormOutletCtx }) => {
  const [blockedReason, setBlockedReason] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const enforcePermissions = async () => {
      const { allowed, reason } = await checkSchoolPermission(ctx)
      if (cancelled) return

      setBlockedReason(
        allowed ? null : (reason ?? 'You do not have permission to edit this record.'),
      )

      const modelFields = Object.values(ctx.fields).filter(
        (f) => f?.relationships?.item_type?.data?.id === ctx.itemType.id,
      )

      for (const field of modelFields) {
        const apiKey = field?.attributes?.api_key
        if (!apiKey) continue
        try {
          await ctx.disableField(apiKey, !allowed)
        } catch (e) {
          console.error(LOG, 'disableField failed for', apiKey, e)
        }
      }
    }

    enforcePermissions().catch((e) => console.error(LOG, 'enforce crashed', e))

    return () => {
      cancelled = true
    }
  }, [ctx.formValues.site, ctx.itemStatus, ctx.currentRole])

  if (blockedReason) {
    return (
      <Canvas ctx={ctx}>
        <div
          role="alert"
          style={{
            padding: '0.5em 1em',
            boxSizing: 'border-box',
            width: 'calc(100% + 20px)',
            margin: '-10px -10px 1em',
            border: '1px solid var(--color--danger-soft--ink)',
            borderRadius: '4px',
            color: 'var(--color--danger-soft--ink)',
            fontFamily: 'var(--base-font-family, sans-serif)',
          }}
        >
          <p style={{ margin: '0.5em 0' }}>
            <strong>This record is read-only for you.</strong>
          </p>
          <p style={{ margin: '0.5em 0' }}>{blockedReason}</p>
        </div>
      </Canvas>
    )
  }
}

connect({
  itemFormOutlets() {
    return [{ id: 'schoolPermissionGuard', initialHeight: 0 }]
  },

  renderItemFormOutlet(outletId, ctx: RenderItemFormOutletCtx) {
    if (outletId === 'schoolPermissionGuard') {
      return render(<GuardComponent ctx={ctx} />)
    }
  },

  async onBeforeItemsPublish(items, ctx) {
    const assignedSchool = getSchoolFromRole(ctx.currentRole?.attributes?.name)

    // Non-"School Editor" roles bypass publish restrictions completely
    if (!assignedSchool) return true

    try {
      const client = getClient(ctx)
      const siteNameCache = new Map<string, string | undefined>()

      const getSiteName = async (siteId: string) => {
        if (!siteNameCache.has(siteId)) {
          const siteRecord = await client.items.find(siteId)
          siteNameCache.set(siteId, extractSiteName(siteRecord))
        }
        return siteNameCache.get(siteId)
      }

      const blocked: string[] = []

      for (const item of items) {
        const siteId = (item.attributes?.site ?? (item as any).site) as string | undefined

        if (!siteId) {
          blocked.push(`${item.id} (no site linked)`)
          continue
        }

        const siteName = await getSiteName(siteId)
        if (normalize(siteName) !== normalize(assignedSchool)) {
          blocked.push(`${item.id} (belongs to "${siteName ?? 'unknown'}")`)
        }
      }

      if (blocked.length > 0) {
        await ctx.alert(
          `Cannot publish: your role is limited to "${assignedSchool}", but ${
            blocked.length === 1 ? 'this record is' : 'these records are'
          } not assigned to it: ${blocked.join(', ')}.`,
        )
        return false
      }

      return true
    } catch (e) {
      console.error(LOG, 'publish check failed -> blocking', e)
      await ctx.alert(
        'Cannot publish: could not verify which school this record belongs to.',
      )
      return false
    }
  },
})
