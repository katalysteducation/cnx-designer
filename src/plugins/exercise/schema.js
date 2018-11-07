// Copyright 2018 OpenStax Poland
// Licensed under the MIT license. See LICENSE file in the project root for
// full license text.

import { Block, Text } from 'slate'
import {
    CHILD_TYPE_INVALID,
    CHILD_UNKNOWN,
    PARENT_OBJECT_INVALID,
    PARENT_TYPE_INVALID,
} from 'slate-schema-violations'

function normalizeExercise(change, error) {
    const { code: violation, index, node, child } = error

    switch (violation) {
    // A child of different type was expected.
    case CHILD_TYPE_INVALID:
        // A text child could only have been added to an exercise by Slate in
        // event that all other children were removed. In such case we just want
        // to drop the exercise.
        if (Text.isText(child)) {
            change.removeNodeByKey(node.key)
            return
        }
        // A non-empty exercise without a problem should get an empty problem.
        if (index === 0) {
            const problem = Block.create({
                type: 'exercise_problem',
                nodes: [
                    // An empty leaf will be added by slate in a subsequent
                    // normalization.
                    Block.create({ type: 'paragraph' })
                ],
            })
            change.insertNodeByKey(node.key, 0, problem)
            return
        }
        // Otherwise (invalid child after the problem but before the commentary)
        // we lift the invalid child into a new solution.
        change.wrapBlockByKey(child.key, 'exercise_solution')
        break

    // No child was expected.
    case CHILD_UNKNOWN:
        // An invalid node following the commentary should be folded into the
        // commentary.
        if (node.nodes.get(-2).type === 'exercise_commentary') {
            const commentary = node.nodes.get(-2)
            change.moveNodeByKey(child.key, commentary.key, commentary.nodes.size)
            return
        }
        break

    // Exercise was inserted into an invalid parent.
    case PARENT_OBJECT_INVALID:
    case PARENT_TYPE_INVALID:
        change.unwrapBlockByKey(node.key)
        break

    default:
        console.warn('Unhandled exercise violation:', violation)
        break
    }
}

function normalizeContent(change, error) {
    const { code: violation, node } = error

    switch (violation) {
    // Problems, solutions, and commentaries make no sense outside an exercise.
    // Should it happen however, just replace it with its contents.
    case PARENT_TYPE_INVALID:
        change.unwrapBlockByKey(node.key)
        break

    default:
        console.warn('Unhandled exercise content violation:', violation)
        break
    }
}

const CONTENT = {
    match: [
        { type: 'paragraph' },
        { type: 'ul_list' },
        { type: 'ol_list' },
    ],
    min: 1,
}

export const EXERCISE_PARENT = ['document', 'section']

export default {
    blocks: {
        exercise: {
            parent: [{ object: 'document' }, { type: 'section' }],
            nodes: [
                { match: { type: 'exercise_problem' }, min: 1, max: 1},
                { match: { type: 'exercise_solution' }, min: 0 },
                { match: { type: 'exercise_commentary' }, min: 0, max: 1 },
            ],
            normalize: normalizeExercise,
        },
        exercise_problem: {
            parent: { type: 'exercise' },
            nodes: [CONTENT],
            normalize: normalizeContent,
        },
        exercise_solution: {
            parent: { type: 'exercise' },
            nodes: [CONTENT],
            normalize: normalizeContent,
        },
        exercise_commentary: {
            parent: { type: 'exercise' },
            nodes: [CONTENT],
            normalize: normalizeContent,
        },
    },
}
