
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  const url = new URL(request.url)
  const pathname = url.pathname
  const searchParams = url.searchParams

  // Proxy only timetable API requests to avoid leaking private keys
  if (pathname.startsWith("/api/timetable")) {
    // Replace with actual Aviation Edge API endpoint
    const apiUrl = `https://aviation-edge.com/v2/public/timetable${searchParams.toString()}`
    const headers = new Headers()
    headers.set('Authorization', 'Bearer YOUR_SECRET_API_KEY')  // replace with actual key
    const response = await fetch(apiUrl, { headers })
    return response
  } else {
    return new Response('Invalid request', { status: 400 })
  }
}
