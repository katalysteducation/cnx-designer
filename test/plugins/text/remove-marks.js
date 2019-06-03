/** @jsx h */

export default editor => editor.removeMarks()

export const input = <value>
    <document>
        <p><b>Before</b>, <i>aft<anchor/><u>er,</u></i><focus/> end</p>
    </document>
</value>

export const output = <value>
    <document>
        <p><b>Before</b>, <i>aft</i><anchor/>er,<focus/> end</p>
    </document>
</value>
