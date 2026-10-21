import React from 'react'

function inlineParts(text, keyPrefix = 'inline') {
  const pattern = /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\*[^*\n]+\*|_[^_\n]+_|Bold\s+\[[^\]]+\]|\[[^\]]+\]\(https?:\/\/[^\s)]+\))/g
  const parts = []
  let last = 0
  let match
  let index = 0

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index))
    const token = match[0]
    const key = `${keyPrefix}-${index++}`

    if (token.startsWith('**') || token.startsWith('__')) {
      parts.push(<strong key={key}>{token.slice(2, -2)}</strong>)
    } else if (/^Bold\s+\[[^\]]+\]$/.test(token)) {
      // Tolerate the model's non-standard `Bold [Title]` format in table cells.
      parts.push(<strong key={key}>{token.replace(/^Bold\s+\[|\]$/g, '')}</strong>)
    } else if (token.startsWith('`')) {
      parts.push(<code key={key}>{token.slice(1, -1)}</code>)
    } else if (token.startsWith('*') || token.startsWith('_')) {
      parts.push(<em key={key}>{token.slice(1, -1)}</em>)
    } else {
      const link = token.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/)
      if (link) parts.push(<a key={key} href={link[2]} target="_blank" rel="noreferrer noopener">{link[1]}</a>)
      else parts.push(token)
    }
    last = pattern.lastIndex
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}

function isUnordered(line) { return /^\s*[-*+]\s+/.test(line) }
function isOrdered(line) { return /^\s*\d+[.)]\s+/.test(line) }
function isPipeRow(line) { return /^\s*\|.*\|\s*$/.test(line) }
function splitPipeRow(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim())
}
function isTableDivider(line) {
  const cells = splitPipeRow(line)
  return isPipeRow(line) && cells.length > 0 && cells.every(cell => /^:?-{3,}:?$/.test(cell.replace(/\s/g, '')))
}

export default function MarkdownMessage({ content = '' }) {
  const lines = String(content).replace(/\r\n?/g, '\n').split('\n')
  const blocks = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]
    if (!line.trim()) { index++; continue }

    const heading = line.match(/^\s*(#{1,6})\s+(.+?)\s*#*\s*$/)
    if (heading) {
      const level = Math.min(heading[1].length, 4)
      const Tag = `h${level}`
      blocks.push(<Tag key={`h-${index}`}>{inlineParts(heading[2], `h-${index}`)}</Tag>)
      index++
      continue
    }

    if (isPipeRow(line)) {
      const rows = []
      while (index < lines.length && isPipeRow(lines[index])) {
        if (!isTableDivider(lines[index])) rows.push({ cells: splitPipeRow(lines[index]), line: index })
        index++
      }
      if (rows.length) {
        const width = Math.max(...rows.map(row => row.cells.length))
        blocks.push(
          <div className="markdown-table-wrap" key={`table-${rows[0].line}`}>
            <table className="markdown-table">
              <tbody>
                {rows.map((row, rowIndex) => (
                  <tr key={`row-${row.line}`}>
                    {Array.from({ length: width }, (_, cellIndex) => {
                      const Cell = rowIndex === 0 && rows.length > 1 && isTableDivider(lines[row.line + 1] || '') ? 'th' : 'td'
                      return <Cell key={`cell-${cellIndex}`}>{inlineParts(row.cells[cellIndex] || '', `cell-${row.line}-${cellIndex}`)}</Cell>
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      }
      continue
    }

    if (/^\s*([-*_]\s*){3,}$/.test(line)) {
      blocks.push(<hr key={`hr-${index}`} />); index++; continue
    }

    if (isUnordered(line) || isOrdered(line)) {
      const ordered = isOrdered(line)
      const items = []
      while (index < lines.length && (ordered ? isOrdered(lines[index]) : isUnordered(lines[index]))) {
        const itemText = lines[index].replace(ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*+]\s+/, '')
        items.push(<li key={`li-${index}`}>{inlineParts(itemText, `li-${index}`)}</li>)
        index++
      }
      const ListTag = ordered ? 'ol' : 'ul'
      blocks.push(<ListTag key={`list-${index}`}>{items}</ListTag>)
      continue
    }

    if (/^\s*>/.test(line)) {
      const quoteLines = []
      while (index < lines.length && /^\s*>/.test(lines[index])) {
        quoteLines.push(lines[index].replace(/^\s*>\s?/, ''))
        index++
      }
      blocks.push(<blockquote key={`quote-${index}`}>{quoteLines.map((quote, i) => <p key={i}>{inlineParts(quote, `quote-${index}-${i}`)}</p>)}</blockquote>)
      continue
    }

    const paragraph = []
    while (index < lines.length && lines[index].trim() && !/^\s*(#{1,6}\s+|[-*+]\s+|\d+[.)]\s+|>|\|.*\|\s*$|([-*_]\s*){3,}$)/.test(lines[index])) {
      paragraph.push(lines[index]); index++
    }
    if (paragraph.length) {
      blocks.push(<p key={`p-${index}`}>{paragraph.map((part, i) => <React.Fragment key={i}>{i > 0 && <br />}{inlineParts(part, `p-${index}-${i}`)}</React.Fragment>)}</p>)
    } else {
      // Avoid an infinite loop if a future Markdown construct is not recognized.
      blocks.push(<p key={`plain-${index}`}>{inlineParts(lines[index], `plain-${index}`)}</p>)
      index++
    }
  }

  return <div className="markdown-content">{blocks}</div>
}
