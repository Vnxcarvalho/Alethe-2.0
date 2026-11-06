#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Started as `tmux` (a copy of this binary the app installs for its terminals): act as the
    // tmux stand-in instead of opening the app.
    if alethe_lib::invoked_as_tmux() {
        alethe_lib::run_tmux_shim()
    }
    alethe_lib::run()
}
