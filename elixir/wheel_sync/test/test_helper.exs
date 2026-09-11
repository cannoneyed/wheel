exclude = if System.get_env("DATABASE_URL"), do: [], else: [:postgres]

exclude =
  if System.get_env("WHEEL_WRITE_BENCHMARK") == "1", do: exclude, else: [:benchmark | exclude]

ExUnit.start(exclude: exclude)
