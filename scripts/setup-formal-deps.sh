#!/bin/sh
# Install the system tools used to render formal transition table images.
set -eu

if [ ! -r /etc/os-release ]; then
    echo "Cannot detect this operating system. Install TeX Live (LuaLaTeX or XeLaTeX), the LaTeX extra packages, and Poppler's pdftoppm manually." >&2
    exit 1
fi
. /etc/os-release

case "${ID:-}" in
    arch|manjaro|endeavouros)
        packages="texlive-luatex texlive-xetex texlive-latexextra texlive-fontsrecommended poppler ttf-dejavu"
        command -v pacman >/dev/null 2>&1 || { echo "pacman is required for ${ID}." >&2; exit 1; }
        installer="pacman -S --needed $packages"
        ;;
    debian|ubuntu|linuxmint|pop)
        packages="texlive-luatex texlive-xetex texlive-latex-extra lmodern poppler-utils fonts-dejavu-core"
        command -v apt-get >/dev/null 2>&1 || { echo "apt-get is required for ${ID}." >&2; exit 1; }
        installer="apt-get install -y $packages"
        ;;
    fedora)
        packages="texlive-luatex texlive-xetex texlive-collection-latexextra texlive-lm poppler-utils dejavu-sans-fonts"
        command -v dnf >/dev/null 2>&1 || { echo "dnf is required for Fedora." >&2; exit 1; }
        installer="dnf install -y $packages"
        ;;
    *)
        echo "No automatic installer for ${ID:-this Linux distribution}. Install TeX Live (LuaLaTeX or XeLaTeX), the LaTeX extra packages, and Poppler's pdftoppm manually." >&2
        exit 1
        ;;
esac

if [ "$(id -u)" -eq 0 ]; then
    # Intentional splitting: installer and package names above are fixed constants.
    # shellcheck disable=SC2086
    $installer
else
    if ! command -v sudo >/dev/null 2>&1; then
        echo "sudo is required to install system packages; run this script as root instead." >&2
        exit 1
    fi
    # Intentional splitting: installer and package names above are fixed constants.
    # shellcheck disable=SC2086
    sudo $installer
fi

if ! command -v kpsewhich >/dev/null 2>&1 || ! kpsewhich lmroman10-regular.otf >/dev/null 2>&1; then
    echo "Installation finished, but TeX still cannot find Latin Modern fonts. Check the package manager output and TeX configuration." >&2
    exit 1
fi
echo "Formal table image dependencies, including Latin Modern fonts, are ready."
