interface Props {
  text: string
}

export function AssistantSuggestion({ text }: Props) {
  return (
    <div className="space-y-3 text-sm leading-relaxed text-gray-300">
      {text.split('\n\n').map((block, blockIndex) => {
        const lines = block.split('\n')
        return (
          <p key={blockIndex}>
            {lines.map((line, lineIndex) => (
              <span key={lineIndex}>
                {line.split(/(\*\*[^*]+\*\*)/).map((part, partIndex) =>
                  part.startsWith('**') && part.endsWith('**')
                    ? <strong key={partIndex} className="font-semibold text-white">{part.slice(2, -2)}</strong>
                    : part,
                )}
                {lineIndex < lines.length - 1 ? <br /> : null}
              </span>
            ))}
          </p>
        )
      })}
    </div>
  )
}
