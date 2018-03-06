/**
 * Load a block element.
 *
 * @see BLOCK_TAGS
 */
const BLOCK = {
    deserialize(el, next) {
        const block = BLOCK_TAGS[el.tagName]
        if (!block) return

        const props = block instanceof Function ? block(el, next) : {
            type: block,
            nodes: next(Array.from(el.children)),
        }

        return {
            object: 'block',
            key: el.getAttribute('id') || undefined,
            ...props,
        }
    }
}


/**
 * Load marks.
 *
 * @see MARK_TAGS
 */
const MARK = {
    deserialize(el, next) {
        const inline = MARK_TAGS[el.tagName]
        if (!inline) return

        const props = inline instanceof Function ? inline(el, next) : {
            type: inline,
        }

        return {
            object: 'mark',
            key: el.getAttribute('id') || undefined,
            nodes: next(el.childNodes),
            ...props,
        }
    }
}


/**
 * Tags which are only used in-line, mixed with text nodes.
 *
 * This array is used to differentiate between tags with only block tags, and
 * tags with mixed content (inline tags and text).
 *
 * @see mixedContent
 */
const INLINE_TAGS = [
    'emphasis',
    'footnote',
    'foreign',
    'link',
    'sub',
    'sup',
]


/**
 * Create transformer function for nodes containing just text.
 */
const text = type => (el, next) => ({
    type: type,
    nodes: next(el.childNodes),
})


/**
 * Create transformer function for nodes containing either just text or block
 * content.
 */
const mixed = type => (el, next) => ({
    type: type,
    nodes: mixedContent(el, next),
})


/**
 * Tags which can occur in block content.
 *
 * Keys are CNXML tag names, values are _transformer functions_. Transformer
 * functions map CNXML elements to Slate node properties. The resulting
 * properties are then augmented, if missing, with `object` and `key`
 * properties.
 *
 * Two transformer functions are predefined for nodes with no custom properties:
 * `text` for elements containing only text, and `mixed` for element which can
 * contain either text or block content.
 *
 * As a special case, if value is a string then the element is loaded as a
 * non-void block node with type determined by the value, with no special
 * properties, and its children processed as blocks.
 *
 * @see BLOCK
 */
const BLOCK_TAGS = {
    caption: text('figure_caption'),
    commentary: mixed('exercise_commentary'),
    exercise: 'exercise',
    figure: 'figure',
    image: image,
    media: media,
    note: admonition,
    para: text('paragraph'),
    problem: 'exercise_problem',
    section: 'section',
    solution: 'exercise_solution',
    subfigure: 'figure',
    title: text('title'),
}


/**
 * Mark loading works similarly to loading block tags, except the transformer
 * function isn't given the children transformer, and children are instead
 * processed by {@link MARK}.
 *
 * @see MARK
 * @see BLOCK_TAGS
 */
const MARK_TAGS = {
    emphasis: emphasis,
    sub: 'subscript',
    sup: 'superscript',
}


/**
 * Process data for admonitions.
 */
function admonition(el, next) {
    return {
        type: 'admonition',
        key: el.getAttribute('id') || undefined,
        data: {
            type: el.getAttribute('type') || 'note',
        },
        nodes: mixedContent(el, next),
    }
}


/**
 * Process data for emphasis marks.
 */
function emphasis(el) {
    const EFFECTS = {
        bold: 'strong',
        italics: 'emphasis',
        underline: 'underline',
    }

    return {
        type: EFFECTS[el.getAttribute('effect') || 'bold'] || 'strong',
    }
}


/**
 * Process data for media nodes.
 */
function media(el, next) {
    return {
        type: 'media',
        data: {
            alt: el.getAttribute('alt'),
        },
        nodes: next(Array.from(el.children)),
    }
}


/**
 * Process data for images.
 */
function image(el) {
    return {
        type: 'image',
        isVoid: true,
        data: {
            src: el.getAttribute('src'),
        },
    }
}


/**
 * Load content as either a sequence of block nodes, or text wrapped in a block
 * node.
 */
function mixedContent(el, next, type='paragraph') {
    const cl = el.childNodes[0]
    const text = cl.nodeType === cl.TEXT_NODE && cl.textContent.match(/[^\s]/)

    if (text || INLINE_TAGS.includes(cl.tagName)) {
        return [{
            object: 'block',
            type: type,
            nodes: next(el.childNodes),
        }]
    } else {
        return next(Array.from(el.children))
    }
}


export default [
    BLOCK,
    MARK,
]