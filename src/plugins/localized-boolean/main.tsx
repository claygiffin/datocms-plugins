import { connect } from 'datocms-plugin-sdk'
import 'datocms-react-ui/styles.css'
import { render } from '../../utils/render'
import { LocalizedBoolean } from './LocalizedBoolean'

connect({
  manualFieldExtensions() {
    return [
      {
        id: 'localizedBoolean',
        name: 'Localized Boolean',
        type: 'editor',
        fieldTypes: ['boolean'],
      },
    ]
  },

  renderFieldExtension(fieldExtensionId, ctx) {
    if (fieldExtensionId === 'localizedBoolean') {
      render(<LocalizedBoolean ctx={ctx} />)
    }
  },
})
