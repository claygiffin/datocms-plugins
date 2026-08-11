import { connect, RenderFieldExtensionCtx } from 'datocms-plugin-sdk'
import 'datocms-react-ui/styles.css'
import { render } from '../../utils/render'
import { ConfigScreen } from './ConfigScreen'
import { SyncBlocksButton } from './SyncBlocksButton'

connect({
  manualFieldExtensions() {
    return [
      {
        id: 'syncBlocksButton',
        name: 'Sync Blocks Button',
        type: 'editor',
        fieldTypes: ['string'],
        configurable: true,
      },
    ]
  },

  renderManualFieldExtensionConfigScreen(fieldExtensionId, ctx) {
    if (fieldExtensionId === 'syncBlocksButton') {
      render(<ConfigScreen ctx={ctx} />)
    }
  },

  renderFieldExtension(fieldExtensionId, ctx) {
    if (fieldExtensionId === 'syncBlocksButton') {
      render(<SyncBlocksButton ctx={ctx as RenderFieldExtensionCtx} />)
    }
  },
})
