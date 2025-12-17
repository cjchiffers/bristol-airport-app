
(() => {
  "use strict";

  // Nominatim Geocoding API - gets latitude and longitude for a city
  async function geocodeCity(cityName) {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(cityName)}&format=json&limit=1`;
    try {
      const response = await fetch(url);
      const data = await response.json();
      if (data && data.length > 0) {
        const lat = data[0].lat;
        const lon = data[0].lon;
        return { latitude: parseFloat(lat), longitude: parseFloat(lon) };
      } else {
        console.error("City not found:", cityName);
        return null;
      }
    } catch (error) {
      console.error("Geocoding error:", error);
      return null;
    }
  }
  
  async function geocodeCached(cityName) {
    const key = `geo_city_${String(cityName).toLowerCase()}`;
    const cachedRaw = safeGetLocal(key);
    if (cachedRaw) {
      try {
        const cached = JSON.parse(cachedRaw);
        if (cached && typeof cached.lat === "number" && typeof cached.lon === "number") return cached;
      } catch {}
    }
    const result = await geocodeCity(cityName);
    if (result) {
      safeSetLocal(key, JSON.stringify(result));  // Cache the result for next time
    }
    return result;
  }
  
  // Other functions for rendering, flight updates, etc. remain here...
  
})();
