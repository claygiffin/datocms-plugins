import { parse5ToStructuredText } from 'datocms-html-to-structured-text'
import { RenderFieldExtensionCtx } from 'datocms-plugin-sdk'
import { isEmptyDocument } from 'datocms-structured-text-utils'
import get from 'lodash/get'
import { marked } from 'marked'
import { parse } from 'parse5'
import { useCallback, useEffect, useRef } from 'react'

type Props = {
  ctx: RenderFieldExtensionCtx
}

// Generates short unique IDs required by Slate internal node key indexing
const generateId = () => Math.random().toString(36).substring(2, 9)

// Helper to convert DAST AST nodes into DatoCMS Slate editor nodes
const convertDastNodeToSlate = (node: any): any => {
  if (!node) return null

  // Leaf node (span / text)
  if (node.type === 'span') {
    const leaf: Record<string, any> = { text: node.value || '' }
    if (node.marks) {
      node.marks.forEach((mark: string) => {
        leaf[mark] = true
      })
    }
    return leaf
  }

  // Container nodes (heading, paragraph, list, item, blockquote, etc.)
  const children =
    Array.isArray(node.children) ?
      node.children.map(convertDastNodeToSlate).filter(Boolean)
    : [{ text: '' }]

  const slateNode: Record<string, any> = {
    id: generateId(),
    type: node.type,
    children: children.length > 0 ? children : [{ text: '' }],
  }

  if (node.level) {
    slateNode.level = node.level
  }

  if (node.style) {
    slateNode.style = node.style
  }

  return slateNode
}

const dastToSlate = (dastContainer: any) => {
  const document = dastContainer?.document || dastContainer
  const children = document?.children || []

  if (!Array.isArray(children)) return []

  return children.map(convertDastNodeToSlate)
}

export const StructuredTextDefaultValue = ({ ctx }: Props) => {
  const currentValue = get(ctx.formValues, ctx.fieldPath)
  const rawMarkdown = ctx.parameters.defaultMarkdown
  const defaultMarkdown = typeof rawMarkdown === 'string' ? rawMarkdown : ''

  const hasPopulated = useRef(false)

  const buildDastFromMarkdown = useCallback(async (md: string) => {
    if (!md.trim()) return null

    try {
      const htmlString = await marked.parse(md)
      const parse5Ast = parse(htmlString, { sourceCodeLocationInfo: true })
      const dastContainer = await parse5ToStructuredText(parse5Ast)
      return dastToSlate(dastContainer)
    } catch (error) {
      console.log(error)
      return null
    }
  }, [])

  useEffect(() => {
    const checkIsEmpty = (val: unknown): boolean => {
      if (val === null || val === undefined) return true
      if (Array.isArray(val) && val.length === 0) return true

      try {
        return isEmptyDocument(val as Parameters<typeof isEmptyDocument>[0])
      } catch (error) {
        console.log(error)
        return true
      }
    }

    const isNewBlock = Boolean(ctx.block) && !ctx.block?.id
    const isNewRecord = !ctx.item?.id
    const isNew = isNewBlock || isNewRecord
    const fieldIsEmpty = checkIsEmpty(currentValue)

    if (isNew && fieldIsEmpty && defaultMarkdown && !hasPopulated.current) {
      hasPopulated.current = true

      buildDastFromMarkdown(defaultMarkdown).then((slatePayload) => {
        if (slatePayload) {
          ctx.setFieldValue(ctx.fieldPath, slatePayload)
        }
      })
    }
  }, [
    currentValue,
    defaultMarkdown,
    buildDastFromMarkdown,
    ctx.block?.id,
    ctx.item?.id,
    ctx.fieldPath,
    ctx.setFieldValue,
  ])

  return null
}
