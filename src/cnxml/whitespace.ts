// Copyright 2020 OpenStax Poland
// Licensed under the MIT license. See LICENSE file in the project root for
// full license text.

import { Editor, Element, Node, Path, Point, Text, Transforms } from 'slate'

import { isPlainText } from './util'
import { enumerate } from '../util'

/**
 * Normalize white space in a node.
 *
 * White space codepoints in Unicode can be roughly divided into four categories
 * spacing marks, non-breaking spacing marks, zero-width marks, and line breaks.
 *
 * Spacing marks are codepoints used (usually) to separate words. As of Unicode
 * 12.1 those are: U+0009 CHARACTER TABULATION, U+0020 SPACE, U+1680 OGHAM SPACE
 * MARK, U+2000 EN QUAD, U+2001 EM QUAD, U+2002 EN SPACE, U+2003 EM SPACE,
 * U+2004 THREE-PER-EM SPACE, U+2005 FOUR-PER-EM SPACE, U+2006 SIX-PER-EM SPACE,
 * U+2008 PUNCTUATION SPACE, U+2009 THIN SPACE, U+200A HAIR SAPCE, U+205F MEDIUM
 * MATHEMATICAL SPACE, and U+3000 IDEOGRAPHIC SPACE.
 *
 * Non-breaking spacing marks are spacing marks which prevent line breaks from
 * being inserted. As of Unicode 12.1 those are: U+00A0 NO-BREAK SPACE,
 * U+2007 FIGURE SPACE, and U+202F NARROW NO-BREAK SPACE.
 *
 * Zero-width marks are codepoints which themselves do not impact spacing
 * between words (hence zero-width), but affect spacing and rendering in other
 * ways. As of Unicode 12.1 those are: U+180E MONGOLIAN VOWEL SEPARATOR,
 * U+200B ZERO WIDTH SPACE, U+200C ZERO WIDTH NON-JOINER, U+200D ZERO WIDTH
 * JOINER, U+2060 WORD JOINER, and U+FEFF ZERO WIDTH NON-BREAKING SPACE.
 *
 * Line breaks are codepoints which introduce a line break. As of Unicode 12.1
 * those are: U+000A LINE FEED, U+000B LINE TABULATION, U+000C FORM FEED,
 * U+000D CARRAGE RETURN, U+0085 NEXT LINE, U+2028 LINE SEPARATOR, and
 * U+2029 PARAGRAPH SEPARATOR.
 *
 * White space normalization is done in steps:
 *
 * 1.  First all spacing marks and line breaks are changed into U+0020 SPACE,
 *     all non-breaking spacing marks into U+00A0 NO-BREAK SPACE, and U+FEFF
 *     ZERO WIDTH NON-BREAKING SPACE into U+2060 WORD JOINER. The exception to
 *     this are U+1680 OGHAM SPACE MARK and U+3000 IDEOGRAPHIC SPACE which are
 *     left unchanged.
 *
 * 2.  Next, all zero-width marks neighbouring a spacing mark are removed.
 *
 * 3.  Next, sequences consisting of a single white space codepoint are
 *     collapsed into a single codepoint.
 *
 * 4.  Next, all spacing marks neighbouring U+1680 OGHAM SPACE MARK or
 *     U+3000 IDEOGRAPHIC SPACE are removed.
 *
 * 5.  Next, all spacing marks neighbouring a non-breaking spacing mark are
 *     removed.
 *
 * 6.  Next, if there still are sequences of white spaces, only their first code
 *     point is retained.
 *
 * 7.  Finally, white space is stripped from beginning and end of nodes, and
 *     end points of marks and inlines are adjusted so that they don't begin or
 *     end with white spaces.
 *
 * Note that this is a conceptual description, and the actual implementation may
 * differ slightly (for example it performs step 7 first).
 */
export default function normalizeWhiteSpace(editor: Editor, at: Path): void {
    const node = Node.get(editor, at)

    const ends = Editor.isInline(editor, node) ? 'unwrap' : 'trim'
    normalizeTextBoundaries(editor, { at, ends })

    normalizeSpaces(editor, at)
}

/**
 * Adjust marks and inlines so that they don't start or end with white space.
 *
 * This function performs the 7th step of white space normalization.
 */
function normalizeTextBoundaries(
    editor: Editor,
    options: {
        at: Path,
        ends?: 'unwrap' | 'trim',
    },
): void {
    const { at, ends = 'trim' } = options
    const nodePath = Editor.pathRef(editor, at)

    // Step 1: adjust white space such that no inline element and no marked text
    // start or end with a white space.
    for (const [child, path] of Node.children(editor, nodePath.current!, { reverse: true })) {
        // Recursively normalize nested elements.
        if (Element.isElement(child)) {
            normalizeTextBoundaries(editor, { at: path, ends: 'unwrap' })
            continue
        }

        if (isPlainText(child)) {
            continue
        }

        const [, before, , after] = child.text.match(/^(\s*)(.*?)(\s*)$/)!

        if (after.length > 0) {
            Transforms.splitNodes(editor, {
                at: { path, offset: child.text.length - after.length },
                match: Text.isText,
            })
            Transforms.unsetNodes(editor, Object.keys(child), { at: Path.next(path) })
        }

        if (before.length > 0) {
            Transforms.splitNodes(editor, {
                at: { path, offset: before.length },
                match: Text.isText,
            })
            Transforms.unsetNodes(editor, Object.keys(child), { at: path })
        }
    }

    // Step 2: remove any white space at start and end of this node by either
    // unwrapping or trimming it.

    const end = findWhitespaceBoundary(editor, { at: nodePath.current!, affinity: 'end' })

    if (end != null && !Editor.isEnd(editor, end, nodePath.current!)) {
        if (ends === 'unwrap') {
            Transforms.splitNodes(editor, { at: end, match: Text.isText })
            Transforms.liftNodes(editor, {
                at: Editor.range(editor, Path.next(end.path), nodePath.current!),
                match: Text.isText,
            })
        } else {
            Transforms.delete(editor, { at: Editor.range(editor, end, at) })
        }
    }

    const start = findWhitespaceBoundary(editor, { at: nodePath.current!, affinity: 'start' })

    if (start != null && !Editor.isStart(editor, start, nodePath.current!)) {
        if (ends === 'unwrap') {
            Transforms.splitNodes(editor, { at: start, match: Text.isText, always: true })
            Transforms.liftNodes(editor, {
                at: Editor.range(editor, nodePath.current!, start),
                match: Text.isText,
            })
        } else {
            Transforms.delete(editor, { at: Editor.range(editor, nodePath.current!, start) })
        }
    }

    // Step 3: merge any two consecutive text elements into one, as long as they
    // have the same properties, and remove empty text nodes.
    collapseAdjacentText(editor, nodePath.current!)

    nodePath.unref()
}

function findWhitespaceBoundary(
    editor: Editor,
    options: {
        at: Path,
        affinity: 'start' | 'end',
    },
): Point | undefined {
    const { at, affinity } = options
    const node = Node.get(editor, at)
    const re = affinity === 'start' ? /^\s*/u : /\s*$/u

    if (Text.isText(node)) {
        const match = node.text.match(re)!

        return {
            path: at,
            offset: affinity === 'start'
                ? match[0].length
                : match.index!,
        }
    }

    for (const [index, child] of enumerate(node.children, affinity === 'end')) {
        if (!Text.isText(child)) {
            return affinity === 'start'
                ? Editor.start(editor, [...at, index])
                : Editor.end(editor, [...at, index])
        }

        const match = child.text.match(re)!

        if (match[0].length === child.text.length) continue

        return {
            path: [...at, index],
            offset: affinity === 'start'
                ? match[0].length
                : match.index!,
        }
    }
}

/** Merge any subsequent text elements sharing same properties */
export function collapseAdjacentText(editor: Editor, at: Path): void {
    const node = Node.get(editor, at) as Element

    for (const [index, child] of enumerate(node.children, true)) {
        const prev = node.children[index - 1]

        if (Text.isText(child) && Text.isText(prev)
        && Text.equals(child, prev, { loose: true })) {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { text, ...rest } = child
            editor.apply({
                type: 'merge_node',
                path: [...at, index],
                position: prev.text.length,
                target: null,
                properties: rest,
            })
        }
    }
}

/**
 * Simplify white space by replacing certain groups of code points with a single
 * codepoint.
 *
 * This function performs steps 1 through 6, assuming that step 7 has already
 * been performed.
 */
function normalizeSpaces(editor: Editor, at: Path) {
    const node = Node.get(editor, at)

    if (!Text.isText(node)) {
        for (let i = 0 ; i < node.children.length ; ++i) {
            normalizeSpaces(editor, [...at, i])
        }
        return
    }

    // no-misleading-character-class warns against using sequences of joining
    // codepoints as they look like a single character but will be matched
    // separately. Here this is exactly what we want, so we can safely disable
    // this lint.
    /* eslint-disable no-misleading-character-class, max-len */

    // 1st step
    regexReplace(editor, at, /\s/gu, replaceWSChar)
    // 2nd step
    regexReplace(editor, at, /\s[\u180e\u200b\u200c\u200d\u2060]/g, c => c[0])
    regexReplace(editor, at, /[\u180e\u200b\u200c\u200d\u2060]\s/g, c => c[1])
    // 3rd step
    regexReplace(editor, at, /[\s\u180e\u200b\u200c\u200d\u2060]{2,}/g, collapseWSSequence)
    // 4th step
    regexReplace(editor, at, /[\u0020\u2000-\u2006\u2008\u2009\u200A\u205F]+([\u1680\u3000])/g, (_, r) => r!)
    regexReplace(editor, at, /([\u1680\u3000][\u0020\u2000-\u2006\u2008\u2009\u200A\u205F]+)/g, (_, r) => r!)
    // 5th step
    regexReplace(editor, at, /[\u0020\u1680\u2000-\u2006\u2008\u2009\u200A\u205F\u3000]+([\u00a0])/g, (_, r) => r!)
    regexReplace(editor, at, /([\u00a0][\u0020\u1680\u2000-\u2006\u2008\u2009\u200A\u205F\u3000]+)/g, (_, r) => r!)
    // 6th step
    regexReplace(editor, at, /[\s\u180e\u200b\u200c\u200d\u2060]{2,}/g, c => c[0])

    /* eslint-enable no-misleading-character-class, max-len */
}

const WHITE_SPACE_MAP: { [key: string]: string | undefined } = {
    '\u0009': ' ', // CHARACTER TABULATION
    '\u000a': ' ', // LINE FEED
    '\u000b': ' ', // LINE TABULATION
    '\u000c': ' ', // FORM FEED
    '\u000d': ' ', // CARRAGE RETURN
    '\u0085': ' ', // NEXT LINE
    '\u2000': ' ', // EN QUAD
    '\u2001': ' ', // EM QUAD
    '\u2002': ' ', // EN SPACE
    '\u2003': ' ', // EM SPACE
    '\u2004': ' ', // THREE-PER-EM SPACE
    '\u2005': ' ', // FOUR-PER-EM SPACE
    '\u2006': ' ', // SIX-PER-EM SPACE
    '\u2007': '\u00a0', // FIGURE SPACE
    '\u2008': ' ', // PUNCTUATION SPACE
    '\u2009': ' ', // THIN SPACE
    '\u200a': ' ', // HAIR SAPCE
    '\u2028': ' ', // LINE SEPARATOR
    '\u2029': ' ', // PARAGRAPH SEPARATOR
    '\u202f': '\u00a0', // NARROW NO-BREAK SPACE
    '\u205f': ' ', // MEDIUM MATHEMATICAL SPACE
    '\ufeff': '\u2060', // ZERO WIDTH NON-BREAKING SPACE
}

function replaceWSChar(char: string): string {
    return WHITE_SPACE_MAP[char] ?? char
}

function collapseWSSequence(seq: string): string {
    let start = 0
    let out = ''

    for (let i=1 ; i<seq.length ; ++i) {
        if (seq[i] !== seq[start]) {
            out += seq[start]
            start = i
        }
    }

    if (seq[start] === seq[seq.length - 1]) {
        out += seq[start]
    }

    return out
}

/**
 * Equivalent of String#replace working on Slate nodes
 *
 * This function will replace each occurrence by issuing `remove_text` and
 * `apply_text` operations.
 *
 * `path` must point at a {@link Text} node.
 */
function regexReplace(
    editor: Editor,
    path: Path,
    re: RegExp,
    replacer: (substring: string, ...args: (string | undefined)[]) => string,
) {
    Editor.withoutNormalizing(editor, () => {
        const node = Node.get(editor, path)

        if (!Text.isText(node)) {
            throw new Error(`Cannot RegExp replace a non-text node at path [${path}]`)
        }

        let adjust = 0

        for (const m of node.text.matchAll(re)) {
            const [remove, ...args] = m
            const add = replacer(remove, ...args)
            const offset = m.index! + adjust

            editor.apply({ type: 'remove_text', path, offset, text: remove })
            editor.apply({ type: 'insert_text', path, offset, text: add })

            adjust += add.length - remove.length
        }
    })
}
