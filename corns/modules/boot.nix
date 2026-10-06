# ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
# ┃            Cargador de Botones            ┃
# ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
{
    boot.initrd.availableKernelModules = [
    "ata_piix"
    "uhci_hcd"
    "virtio_pci"
    "virtio_scsi"
    "sd_mod"
    "sr_mod"
    ];

# Auto-expandir la partición raíz y el filesystem si el disco crece
    boot.growPartition = true;
    fileSystems."/".autoResize = true;

    boot.loader.grub.enable = true;
    system.stateVersion = "25.11";
}