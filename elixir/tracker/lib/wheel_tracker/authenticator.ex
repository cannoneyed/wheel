defmodule WheelTracker.Authenticator do
  @moduledoc false
  @behaviour WheelSync.Authenticator

  @impl true
  def authenticate(conn, _config) do
    user_id = conn.query_params["demoUser"]
    session_id = conn.query_params["demoSession"]

    if present?(user_id) and present?(session_id) do
      {:ok,
       %WheelSync.Principal{
         actor: "user:" <> user_id,
         workspace_id: System.get_env("TRACKER_WORKSPACE_ID", "axle-demo"),
         session_id: session_id
       }}
    else
      :error
    end
  end

  defp present?(value), do: is_binary(value) and value != ""
end
