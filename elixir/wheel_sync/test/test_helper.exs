if System.get_env("DATABASE_URL") do
  ExUnit.start()
else
  ExUnit.start(exclude: [:postgres])
end
