//! Small standalone `tmux` stand-in, preferred by dev builds because it starts faster than the
//! whole app. Release builds ship without it: the app itself acts as `tmux` (see `tmux_shim.rs`).

#[path = "../tmux_shim.rs"]
#[allow(dead_code)]
mod tmux_shim;

fn main() {
    tmux_shim::run()
}
