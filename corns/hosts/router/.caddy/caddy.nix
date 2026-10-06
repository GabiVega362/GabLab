{ pkgs, ... }:

# ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
# ┃                   Services                ┃
# ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
{
      services.caddy = {
        enable = true;
        enableReload = true;
        logFormat = "level INFO";
        configFile = ./CaddyFile;
      };
}