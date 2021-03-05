/** @jsx h */
/** @jsxFrag 'fragment' */

// It should work when paragraph starts or ends with an empty inline
export const input = cnxml`
<para><emphasis></emphasis>,
<emphasis effect="italics"></emphasis>,
<term></term>,
<term xmlns:cmlnle="http://katalysteducation.org/cmlnle/1.0" cmlnle:reference="other value"></term>,
<term xmlns:cxlxt="http://katalysteducation.org/cxlxt/1.0" cxlxt:index="foreign"></term>,
<term xmlns:cxlxt="http://katalysteducation.org/cxlxt/1.0" cxlxt:index="name" cxlxt:name="John Doe" cxlxt:born="1950" cxlxt:died="2020"></term>,
<sup></sup>,
<sub></sub>,
<link document="d1"></link>,
<link url="https://example.test"></link>,
<footnote id="footnote-id"></footnote>,
<foreign xml:lang="pl"></foreign>
</para>
`.replace(/\s+/g, ' ')

export const output = <document>
    <p>
        {", , , , , , , , , , ,  "}
    </p>
</document>

export const errors = [
    'normalized', // empty inlines are removed
]
