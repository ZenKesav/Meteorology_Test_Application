export function extractCompleteSerialMessages(buffer, chunk) {
  const data = buffer + chunk;
  const messages = [];
  let start = 0;
  let delimiterIndex = data.indexOf('\n', start);

  while (delimiterIndex !== -1) {
    const message = data.slice(start, delimiterIndex).replace(/\r$/, '');
    if (message.length > 0) messages.push(message);
    start = delimiterIndex + 1;
    delimiterIndex = data.indexOf('\n', start);
  }

  return {
    messages,
    remainder: data.slice(start)
  };
}
