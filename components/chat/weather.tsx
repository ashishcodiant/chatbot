"use client";

import cx from "classnames";
import { format, isWithinInterval } from "date-fns";
import {
  Clock3Icon,
  DropletsIcon,
  SunriseIcon,
  SunsetIcon,
  ThermometerIcon,
} from "lucide-react";
import { useEffect, useState } from "react";

const SunIcon = ({ size = 40 }: { size?: number }) => (
  <svg fill="none" height={size} viewBox="0 0 24 24" width={size}>
    <circle cx="12" cy="12" fill="currentColor" r="5" />
    <line stroke="currentColor" strokeWidth="2" x1="12" x2="12" y1="1" y2="3" />
    <line
      stroke="currentColor"
      strokeWidth="2"
      x1="12"
      x2="12"
      y1="21"
      y2="23"
    />
    <line
      stroke="currentColor"
      strokeWidth="2"
      x1="4.22"
      x2="5.64"
      y1="4.22"
      y2="5.64"
    />
    <line
      stroke="currentColor"
      strokeWidth="2"
      x1="18.36"
      x2="19.78"
      y1="18.36"
      y2="19.78"
    />
    <line stroke="currentColor" strokeWidth="2" x1="1" x2="3" y1="12" y2="12" />
    <line
      stroke="currentColor"
      strokeWidth="2"
      x1="21"
      x2="23"
      y1="12"
      y2="12"
    />
    <line
      stroke="currentColor"
      strokeWidth="2"
      x1="4.22"
      x2="5.64"
      y1="19.78"
      y2="18.36"
    />
    <line
      stroke="currentColor"
      strokeWidth="2"
      x1="18.36"
      x2="19.78"
      y1="5.64"
      y2="4.22"
    />
  </svg>
);

const MoonIcon = ({ size = 40 }: { size?: number }) => (
  <svg fill="none" height={size} viewBox="0 0 24 24" width={size}>
    <path
      d="M21 12.79A9 9 0 1 1 11.21 3A7 7 0 0 0 21 12.79z"
      fill="currentColor"
    />
  </svg>
);

const CloudIcon = ({ size = 24 }: { size?: number }) => (
  <svg fill="none" height={size} viewBox="0 0 24 24" width={size}>
    <path
      d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    />
  </svg>
);

type WeatherAtLocation = {
  latitude: number;
  longitude: number;
  generationtime_ms: number;
  utc_offset_seconds: number;
  timezone: string;
  timezone_abbreviation: string;
  elevation: number;
  cityName?: string;
  current_units: {
    time: string;
    interval: string;
    temperature_2m: string;
    relative_humidity_2m?: string;
    apparent_temperature?: string;
  };
  current: {
    time: string;
    interval: number;
    temperature_2m: number;
    relative_humidity_2m?: number;
    apparent_temperature?: number;
  };
  hourly_units: {
    time: string;
    temperature_2m: string;
    relative_humidity_2m?: string;
  };
  hourly: {
    time: string[];
    temperature_2m: number[];
    relative_humidity_2m?: number[];
  };
  daily_units: {
    time: string;
    sunrise: string;
    sunset: string;
    temperature_2m_max?: string;
    temperature_2m_min?: string;
  };
  daily: {
    time: string[];
    sunrise: string[];
    sunset: string[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
  };
};

const SAMPLE: WeatherAtLocation = {
  latitude: 37.8,
  longitude: -122.4,
  generationtime_ms: 0.03,
  utc_offset_seconds: 0,
  timezone: "GMT",
  timezone_abbreviation: "GMT",
  elevation: 18,
  cityName: "San Francisco",
  current_units: {
    time: "iso8601",
    interval: "seconds",
    temperature_2m: "deg C",
    relative_humidity_2m: "%",
    apparent_temperature: "deg C",
  },
  current: {
    time: "2024-10-07T19:30",
    interval: 900,
    temperature_2m: 29.3,
    relative_humidity_2m: 64,
    apparent_temperature: 31.1,
  },
  hourly_units: {
    time: "iso8601",
    temperature_2m: "deg C",
    relative_humidity_2m: "%",
  },
  hourly: {
    time: [
      "2024-10-07T19:00",
      "2024-10-07T20:00",
      "2024-10-07T21:00",
      "2024-10-07T22:00",
      "2024-10-07T23:00",
      "2024-10-08T00:00",
      "2024-10-08T01:00",
      "2024-10-08T02:00",
    ],
    temperature_2m: [29.3, 28.4, 27.2, 25.8, 24.7, 23.6, 22.8, 21.9],
    relative_humidity_2m: [64, 66, 68, 71, 73, 75, 76, 78],
  },
  daily_units: {
    time: "iso8601",
    sunrise: "iso8601",
    sunset: "iso8601",
    temperature_2m_max: "deg C",
    temperature_2m_min: "deg C",
  },
  daily: {
    time: ["2024-10-07"],
    sunrise: ["2024-10-07T07:15"],
    sunset: ["2024-10-07T19:00"],
    temperature_2m_max: [31.4],
    temperature_2m_min: [21.9],
  },
};

function n(num: number): number {
  return Math.round(num);
}

function getHourlyStartIndex(weatherAtLocation: WeatherAtLocation) {
  const index = weatherAtLocation.hourly.time.findIndex(
    (time) => new Date(time) >= new Date(weatherAtLocation.current.time)
  );

  return index >= 0 ? index : 0;
}

function getHumiditySeries(weatherAtLocation: WeatherAtLocation) {
  const hourlyLength = weatherAtLocation.hourly.time.length;
  const fallbackHumidity = weatherAtLocation.current.relative_humidity_2m ?? 0;

  if (
    Array.isArray(weatherAtLocation.hourly.relative_humidity_2m) &&
    weatherAtLocation.hourly.relative_humidity_2m.length > 0
  ) {
    return weatherAtLocation.hourly.relative_humidity_2m;
  }

  return Array.from({ length: hourlyLength }, () => fallbackHumidity);
}

export function Weather({
  weatherAtLocation = SAMPLE,
}: {
  weatherAtLocation?: WeatherAtLocation;
}) {
  const currentHigh =
    weatherAtLocation.daily.temperature_2m_max?.[0] ??
    Math.max(...weatherAtLocation.hourly.temperature_2m.slice(0, 24));
  const currentLow =
    weatherAtLocation.daily.temperature_2m_min?.[0] ??
    Math.min(...weatherAtLocation.hourly.temperature_2m.slice(0, 24));
  const humiditySeries = getHumiditySeries(weatherAtLocation);

  const isDay = isWithinInterval(new Date(weatherAtLocation.current.time), {
    start: new Date(weatherAtLocation.daily.sunrise[0]),
    end: new Date(weatherAtLocation.daily.sunset[0]),
  });

  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    handleResize();
    window.addEventListener("resize", handleResize);

    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const hoursToShow = isMobile ? 5 : 6;
  const currentTimeIndex = getHourlyStartIndex(weatherAtLocation);
  const displayTimes = weatherAtLocation.hourly.time.slice(
    currentTimeIndex,
    currentTimeIndex + hoursToShow
  );
  const displayTemperatures = weatherAtLocation.hourly.temperature_2m.slice(
    currentTimeIndex,
    currentTimeIndex + hoursToShow
  );
  const displayHumidity = humiditySeries.slice(
    currentTimeIndex,
    currentTimeIndex + hoursToShow
  );

  const location =
    weatherAtLocation.cityName ||
    `${weatherAtLocation.latitude?.toFixed(1)}, ${weatherAtLocation.longitude?.toFixed(1)}`;

  return (
    <div
      className={cx(
        "relative flex w-full flex-col gap-4 overflow-hidden rounded-[28px] p-5 shadow-[var(--shadow-float)] backdrop-blur-sm",
        {
          "bg-gradient-to-br from-sky-400 via-blue-500 to-blue-600": isDay,
        },
        {
          "bg-gradient-to-br from-indigo-900 via-slate-900 to-slate-950":
            !isDay,
        }
      )}
    >
      <div className="absolute inset-0 bg-white/8 backdrop-blur-sm" />

      <div className="relative z-10">
        <div className="mb-1 flex items-center justify-between gap-3">
          <div className="font-medium text-white/80 text-xs">{location}</div>
          <div className="text-white/60 text-xs">
            {format(new Date(weatherAtLocation.current.time), "MMM d, h:mm a")}
          </div>
        </div>

        <div className="mb-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className={cx("text-white/90", {
                "text-yellow-200": isDay,
                "text-blue-200": !isDay,
              })}
            >
              {isDay ? <SunIcon size={36} /> : <MoonIcon size={36} />}
            </div>
            <div>
              <div className="font-light text-4xl text-white">
                {n(weatherAtLocation.current.temperature_2m)}
                <span className="text-lg text-white/80">
                  {weatherAtLocation.current_units.temperature_2m}
                </span>
              </div>
              <div className="mt-1 text-white/70 text-xs">
                Feels like{" "}
                {n(
                  weatherAtLocation.current.apparent_temperature ??
                    weatherAtLocation.current.temperature_2m
                )}
                {weatherAtLocation.current_units.apparent_temperature ??
                  weatherAtLocation.current_units.temperature_2m}
              </div>
            </div>
          </div>

          <div className="text-right">
            <div className="font-medium text-white/85 text-xs">Day range</div>
            <div className="mt-1 text-sm text-white">
              {n(currentLow)} to {n(currentHigh)}{" "}
              {weatherAtLocation.current_units.temperature_2m}
            </div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl bg-white/12 p-3 backdrop-blur-sm">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-white/75">
              <DropletsIcon size={14} />
              Humidity
            </div>
            <div className="mt-3 font-semibold text-2xl text-white">
              {n(weatherAtLocation.current.relative_humidity_2m ?? 0)}
              <span className="text-sm text-white/75">
                {weatherAtLocation.current_units.relative_humidity_2m ?? "%"}
              </span>
            </div>
            <div className="mt-1 text-white/65 text-xs">
              Current relative humidity
            </div>
          </div>

          <div className="rounded-2xl bg-white/12 p-3 backdrop-blur-sm">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-white/75">
              <SunriseIcon size={14} />
              Sun cycle
            </div>
            <div className="mt-3 font-semibold text-xl text-white">
              {format(new Date(weatherAtLocation.daily.sunrise[0]), "h:mm a")}
            </div>
            <div className="mt-1 flex items-center gap-2 text-white/65 text-xs">
              <SunsetIcon size={13} />
              Sunset {format(new Date(weatherAtLocation.daily.sunset[0]), "h:mm a")}
            </div>
          </div>

          <div className="rounded-2xl bg-white/12 p-3 backdrop-blur-sm">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-white/75">
              <ThermometerIcon size={14} />
              Forecast
            </div>
            <div className="mt-3 font-semibold text-xl text-white">
              {n(displayTemperatures[0] ?? weatherAtLocation.current.temperature_2m)}
              {weatherAtLocation.current_units.temperature_2m}
            </div>
            <div className="mt-1 flex items-center gap-2 text-white/65 text-xs">
              <Clock3Icon size={13} />
              Next {hoursToShow} hours
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-2xl bg-white/10 p-3.5 backdrop-blur-sm">
          <div className="mb-3 font-medium text-[11px] uppercase tracking-[0.16em] text-white/80">
            Hourly forecast
          </div>
          <div className="grid grid-cols-5 gap-2 md:grid-cols-6">
            {displayTimes.map((time, index) => {
              const hourTime = new Date(time);
              const isCurrentHour =
                hourTime.getHours() ===
                new Date(weatherAtLocation.current.time).getHours();

              return (
                <div
                  className={cx(
                    "flex min-w-0 flex-col items-center gap-1 rounded-xl px-2 py-2",
                    {
                      "bg-white/20": isCurrentHour,
                    }
                  )}
                  key={time}
                >
                  <div className="font-medium text-white/70 text-xs">
                    {index === 0 ? "Now" : format(hourTime, "ha")}
                  </div>
                  <div
                    className={cx("text-white/60", {
                      "text-yellow-200": isDay,
                      "text-blue-200": !isDay,
                    })}
                  >
                    <CloudIcon size={16} />
                  </div>
                  <div className="font-medium text-white text-xs">
                    {n(displayTemperatures[index])}
                    {weatherAtLocation.current_units.temperature_2m}
                  </div>
                  <div className="text-[11px] text-white/60">
                    {n(displayHumidity[index])}
                    {weatherAtLocation.hourly_units.relative_humidity_2m ?? "%"}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-3 flex justify-between gap-3 text-white/60 text-xs">
          <div>Live weather dashboard</div>
          <div>{weatherAtLocation.timezone}</div>
        </div>
      </div>
    </div>
  );
}
