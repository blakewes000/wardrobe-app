// weather.js: gets the weather for the city you type in.
// Weather comes from Open-Meteo, a free service that needs no sign-up or key.
// The app never uses your device's location (GPS). Only the city you type.

// ===== Part 1: Settings and saved info =====

const CITY_KEY = "wardrobe-city";  // where your chosen city is remembered
const UNIT_KEY = "wardrobe-unit";  // "F" or "C" (a Settings page comes in step 7)

// Clean-up: an older version could save a GPS position under this name.
// Delete it so no device location is kept in the browser.
localStorage.removeItem("wardrobe-location");

// The latest weather. The outfit builder (step 5) will read this.
// Temperatures are kept in °C here and only changed to °F for display.
let currentWeather = null;

// ===== Part 2: Grab the parts of the page we need =====

const weatherTemp = document.getElementById("weather-temp");
const weatherSky = document.getElementById("weather-sky");
const weatherFeels = document.getElementById("weather-feels");
const weatherSeason = document.getElementById("weather-season");
const weatherPlace = document.getElementById("weather-place");
const weatherMessage = document.getElementById("weather-message");
const cityForm = document.getElementById("city-form");
const cityInput = document.getElementById("city-input");

// ===== Part 3: Small helpers =====

// Shows a status line under the weather. isError makes it red.
function setWeatherMessage(text, isError) {
  weatherMessage.textContent = text ? "> " + text : "";
  weatherMessage.hidden = !text;
  weatherMessage.classList.toggle("error", Boolean(isError));
}

// Turns a °C number into the chosen unit, like "54°F"
function formatTemp(celsius) {
  const unit = localStorage.getItem(UNIT_KEY) || "F";
  const value = unit === "F" ? celsius * 9 / 5 + 32 : celsius;
  return Math.round(value) + "°" + unit;
}

// Works out the season from today's month.
// Seasons are flipped south of the equator (negative latitude).
function getSeason(latitude) {
  const month = new Date().getMonth(); // 0 = January ... 11 = December
  const north = ["winter", "winter", "spring", "spring", "spring", "summer",
                 "summer", "summer", "fall", "fall", "fall", "winter"];
  const flip = { winter: "summer", summer: "winter", spring: "fall", fall: "spring" };
  const season = north[month];
  return latitude < 0 ? flip[season] : season;
}

// Open-Meteo sends a number for the sky. This turns it into words.
function describeSky(code) {
  if (code === 0) return "clear";
  if (code === 1) return "mostly clear";
  if (code === 2) return "partly cloudy";
  if (code === 3) return "overcast";
  if (code === 45 || code === 48) return "fog";
  if (code >= 51 && code <= 57) return "drizzle";
  if (code >= 61 && code <= 67) return "rain";
  if (code >= 71 && code <= 77) return "snow";
  if (code >= 80 && code <= 82) return "rain showers";
  if (code >= 85 && code <= 86) return "snow showers";
  if (code >= 95) return "thunderstorm";
  return "unknown";
}

// Remembers your city so you only type it once
function saveLocation(location) {
  localStorage.setItem(CITY_KEY, JSON.stringify(location));
}
function loadLocation() {
  try {
    return JSON.parse(localStorage.getItem(CITY_KEY));
  } catch {
    return null;
  }
}

// ===== Part 4: Getting the weather =====

// Asks Open-Meteo for the current weather at a location, then shows it
async function getWeather(location) {
  setWeatherMessage("Fetching weather...");
  const url =
    "https://api.open-meteo.com/v1/forecast" +
    "?latitude=" + location.lat +
    "&longitude=" + location.lon +
    "&current=temperature_2m,apparent_temperature,weather_code" +
    "&timezone=auto";

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error("bad response");
    const data = await response.json();

    currentWeather = {
      tempC: data.current.temperature_2m,
      feelsC: data.current.apparent_temperature,
      sky: describeSky(data.current.weather_code),
      season: getSeason(location.lat),
      place: location.name,
      time: Date.now(),
    };
    showWeather();
    setWeatherMessage("");
  } catch (error) {
    setWeatherMessage("Couldn't reach the weather service. Check your internet, then press Refresh.", true);
  }
}

// Puts the current weather into the weather box
function showWeather() {
  if (!currentWeather) return;
  weatherTemp.textContent = formatTemp(currentWeather.tempC);
  weatherFeels.textContent = formatTemp(currentWeather.feelsC);
  weatherSky.textContent = currentWeather.sky;
  weatherSeason.textContent = currentWeather.season;
  weatherPlace.textContent = currentWeather.place;
}

// ===== Part 5: Finding your city =====

// You type a city, and Open-Meteo's free search finds where it is
async function searchCity(event) {
  event.preventDefault(); // stop the page from reloading
  const city = cityInput.value.trim();
  if (!city) return;

  setWeatherMessage("Searching for " + city + "...");
  const url =
    "https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&format=json&name=" +
    encodeURIComponent(city);

  try {
    const response = await fetch(url);
    const data = await response.json();
    if (!data.results || data.results.length === 0) {
      setWeatherMessage('No place called "' + city + '" was found. Try another spelling.', true);
      return;
    }
    const place = data.results[0];
    // e.g. "Seattle, Washington, United States" (skips any parts that are missing)
    const name = [place.name, place.admin1, place.country].filter(Boolean).join(", ");
    const location = { lat: place.latitude, lon: place.longitude, name };
    saveLocation(location);
    cityForm.hidden = true;
    cityInput.value = "";
    getWeather(location);
  } catch (error) {
    setWeatherMessage("Couldn't search right now. Check your internet and try again.", true);
  }
}

// Shows the type-your-city box with a message
function showCityForm(message) {
  cityForm.hidden = false;
  setWeatherMessage(message, false);
}

// ===== Part 6: Buttons, then start =====

document.getElementById("weather-refresh").addEventListener("click", () => {
  const location = loadLocation();
  if (location) getWeather(location);
  else showCityForm("Type your city to see the weather.");
});

// "City" button opens or closes the city box
document.getElementById("weather-change").addEventListener("click", () => {
  if (cityForm.hidden) showCityForm("Type a new city.");
  else {
    cityForm.hidden = true;
    setWeatherMessage("");
  }
});

cityForm.addEventListener("submit", searchCity);

// On start: use the saved city if there is one, otherwise ask you to type one
const savedLocation = loadLocation();
if (savedLocation) getWeather(savedLocation);
else showCityForm("Type your city to see the weather.");
