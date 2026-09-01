defmodule WheelSpoke.Authenticator do
  @moduledoc false
  @behaviour WheelSync.Authenticator

  @impl true
  def authenticate(conn, _config) do
    actor = conn.query_params["actor"]
    session_id = conn.query_params["session"]
    workspace_id = conn.query_params["workspace"]

    if present?(actor) and present?(session_id) and workspace_id in ["acme", "orbit"] do
      {:ok,
       %WheelSync.Principal{
         actor: actor,
         workspace_id: workspace_id,
         session_id: session_id
       }}
    else
      :error
    end
  end

  defp present?(value), do: is_binary(value) and value != ""
end
