import { connect } from 'datocms-plugin-sdk'
import 'datocms-react-ui/styles.css'
import { render } from '../../utils/render'
import { ConfigScreen } from './ConfigScreen'
import { StructuredTextDefaultValue } from './StucturedTextDefaultValue'

connect({
  manualFieldExtensions() {
    return [
      {
        id: 'structuredTextDefaultValue',
        name: 'Default Value',
        type: 'addon',
        fieldTypes: ['structured_text'],
        configurable: true,
      },
    ]
  },
  renderManualFieldExtensionConfigScreen(fieldExtensionId, ctx) {
    if (fieldExtensionId === 'structuredTextDefaultValue') {
      return render(<ConfigScreen ctx={ctx} />)
    }
  },
  renderFieldExtension(fieldExtensionId, ctx) {
    if (fieldExtensionId === 'structuredTextDefaultValue') {
      return render(<StructuredTextDefaultValue ctx={ctx} />)
    }
  },
})
