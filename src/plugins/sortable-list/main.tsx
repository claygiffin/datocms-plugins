import { connect } from 'datocms-plugin-sdk'
import 'datocms-react-ui/styles.css'
import { render } from '../../utils/render'
import { SortableList } from './SortableList'

connect({
  manualFieldExtensions() {
    return [
      {
        id: 'sortableList',
        name: 'Sortable List',
        type: 'editor',
        fieldTypes: ['json'],
      },
    ]
  },

  renderFieldExtension(fieldExtensionId, ctx) {
    if (fieldExtensionId === 'sortableList') {
      render(<SortableList ctx={ctx} />)
    }
  },
})