def setup_sandbox(sandbox):
    sandbox.policy.deny("*")
    sandbox.policy.ask_user("run_command")
