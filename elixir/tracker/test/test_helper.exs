{:ok, _} = Application.ensure_all_started(:wheel_sync)
ExUnit.start(exclude: if(System.get_env("DATABASE_URL"), do: [], else: [:postgres]))
