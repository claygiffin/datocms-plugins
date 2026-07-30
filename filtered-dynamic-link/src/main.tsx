import {
  ManualFieldExtensionsCtx,
  RenderFieldExtensionCtx,
  RenderManualFieldExtensionConfigScreenCtx,
  connect,
} from 'datocms-plugin-sdk'
import 'datocms-react-ui/styles.css'

import ConfigScreen from './ConfigScreen'
import CustomFilteredLink from './CustomFilteredLink'
import { render } from './utils/render'

connect({
  // 1. Declare the extension so it appears in Field Settings -> Presentation
  manualFieldExtensions(_: ManualFieldExtensionsCtx) {
    return [
      {
        id: 'filteredDynamicLink',
        name: 'Filtered Dynamic Link',
        type: 'editor',
        fieldTypes: ['links', 'link'], // Works on native Link(s)
        configurable: true, // Enables per-field configuration screen
      },
    ]
  },

  // 2. Render the per-field settings UI in DatoCMS
  renderManualFieldExtensionConfigScreen(
    fieldExtensionId,
    ctx: RenderManualFieldExtensionConfigScreenCtx
  ) {
    if (fieldExtensionId === 'filteredDynamicLink') {
      return render(<ConfigScreen ctx={ctx} />)
    }
  },

  // 3. Render the actual field editor in the record editing view
  renderFieldExtension(fieldExtensionId, ctx: RenderFieldExtensionCtx) {
    if (fieldExtensionId === 'filteredDynamicLink') {
      return render(<CustomFilteredLink ctx={ctx} />)
    }
  },
})
