defmodule WheelSync.Reply do
  @moduledoc false
  def send({:socket, pid, id}, result), do: Kernel.send(pid, {:wheel_reply, id, result})
  def send(from, result), do: GenServer.reply(from, result)
end
