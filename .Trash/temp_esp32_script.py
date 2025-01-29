
import os
def list_files(path):
    result = []
    try:
        for entry in os.ilistdir(path):
            name = entry[0]
            full_path = path + '/' + name if path != '/' else '/' + name
            if entry[1] == 0x4000:  # Directory
                result.extend(list_files(full_path))
            else:
                try:
                    size = os.stat(full_path)[6]
                    result.append((full_path, size))
                except:
                    pass
    except:
        pass
    return result

files = list_files('/')
print("=== BEGIN ESP32 FILE LISTING ===")
for path, size in sorted(files):
    if path.startswith('/'): path = path[1:]
    print(f"{size} {path}")
print("=== END ESP32 FILE LISTING ===")
