import * as utils from './utils'


export default function onKeyDown(event, change, editor) {
    switch (event.key) {
    case 'Enter':
        return onEnter(event, change)
    }
}


function onEnter(event, change) {
    // Shift disables special handling
    if (event.shiftKey) {
        return
    }

    // Only handle key if selection is in an empty block, or at a beginning
    // of a block, ...
    const { value } = change
    if (!value.startBlock.isEmpty && value.startOffset > 0) return

    // ... in an admonition
    const admonition = utils.getCurrentAdmonition(value)
    if (!admonition) return

    return change.unwrapBlock('admonition')
}
