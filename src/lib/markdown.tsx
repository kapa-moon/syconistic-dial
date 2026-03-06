import React from "react"

function parseInline(text: string, baseKey: string): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g
  let lastIndex = 0
  let matchIdx = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }
    if (match[2] !== undefined) {
      parts.push(<strong key={`${baseKey}-b${matchIdx}`}>{match[2]}</strong>)
    } else if (match[3] !== undefined) {
      parts.push(<em key={`${baseKey}-i${matchIdx}`}>{match[3]}</em>)
    } else if (match[4] !== undefined) {
      parts.push(
        <code key={`${baseKey}-c${matchIdx}`} className="bg-zinc-100 px-1 rounded text-[0.85em] font-mono">
          {match[4]}
        </code>
      )
    }
    matchIdx++
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }

  return parts.length > 0 ? parts : [text]
}

interface MarkdownTextProps {
  content: string
  className?: string
}

export function MarkdownText({ content, className }: MarkdownTextProps) {
  const blocks: React.ReactNode[] = []
  let listItems: string[] = []
  let listType: "ul" | "ol" = "ul"
  let key = 0

  function flushList() {
    if (listItems.length === 0) return
    const items = listItems.map((item, i) => (
      <li key={i}>{parseInline(item, `li-${key}-${i}`)}</li>
    ))
    if (listType === "ul") {
      blocks.push(
        <ul key={key++} className="list-disc list-outside pl-5 space-y-0.5 my-1.5">
          {items}
        </ul>
      )
    } else {
      blocks.push(
        <ol key={key++} className="list-decimal list-outside pl-5 space-y-0.5 my-1.5">
          {items}
        </ol>
      )
    }
    listItems = []
  }

  const lines = content.split("\n")

  for (const line of lines) {
    const ulMatch = line.match(/^[-*]\s+(.*)/)
    const olMatch = line.match(/^\d+\.\s+(.*)/)
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/)

    if (ulMatch) {
      if (listItems.length > 0 && listType !== "ul") flushList()
      listType = "ul"
      listItems.push(ulMatch[1])
    } else if (olMatch) {
      if (listItems.length > 0 && listType !== "ol") flushList()
      listType = "ol"
      listItems.push(olMatch[1])
    } else {
      flushList()
      if (headingMatch) {
        const level = headingMatch[1].length
        const text = headingMatch[2]
        const hClass =
          level === 1
            ? "text-base font-bold mt-3 mb-1"
            : level === 2
            ? "text-sm font-bold mt-2 mb-1"
            : "text-sm font-semibold mt-1"
        blocks.push(
          <div key={key++} className={hClass}>
            {parseInline(text, `h-${key}`)}
          </div>
        )
      } else if (line.trim() === "") {
        if (blocks.length > 0) {
          blocks.push(<div key={key++} className="h-2" />)
        }
      } else {
        blocks.push(
          <p key={key++} className="leading-relaxed">
            {parseInline(line, `p-${key}`)}
          </p>
        )
      }
    }
  }

  flushList()

  return <div className={`text-sm ${className ?? ""}`}>{blocks}</div>
}
