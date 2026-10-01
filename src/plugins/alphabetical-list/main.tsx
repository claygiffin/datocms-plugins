import { connect } from 'datocms-plugin-sdk'
import 'datocms-react-ui/styles.css'
import { render } from '../../utils/render'
import { AlphabeticalList } from './AlphabeticalList'

connect({
  manualFieldExtensions() {
    return [
      {
        id: 'alphabeticalList',
        name: 'Alphabetical List',
        type: 'editor',
        fieldTypes: ['json'],
      },
    ]
  },

  renderFieldExtension(fieldExtensionId, ctx) {
    if (fieldExtensionId === 'alphabeticalList') {
      render(<AlphabeticalList ctx={ctx} />)
    }
  },
})
