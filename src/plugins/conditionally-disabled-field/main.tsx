import { connect } from 'datocms-plugin-sdk'
import 'datocms-react-ui/styles.css'
import { render } from '../../utils/render'
import { ConditionallyDisabledField } from './ConditionallyDisabledField'
import { ConfigScreen } from './ConfigScreen'

connect({
  manualFieldExtensions() {
    return [
      {
        id: 'conditionallyDisabledField',
        name: 'Conditionally Disabled Field',
        type: 'addon',
        fieldTypes: 'all',
        configurable: true,
      },
    ]
  },
  renderManualFieldExtensionConfigScreen(fieldExtensionId, ctx) {
    if (fieldExtensionId === 'conditionallyDisabledField') {
      render(<ConfigScreen ctx={ctx} />)
    }
  },
  renderFieldExtension(fieldExtensionId, ctx) {
    if (fieldExtensionId === 'conditionallyDisabledField') {
      render(<ConditionallyDisabledField ctx={ctx} />)
    }
  },
})
