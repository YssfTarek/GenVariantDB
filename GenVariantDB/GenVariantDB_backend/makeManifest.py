import os

def makeManifest(path):
    ext = ".vcf"

    file_list = []

    for file in os.listdir(path):
        if file.endswith(ext):
            full_path = os.path.abspath(os.path.join(path,file))
            file_list.append(full_path)

    return (file_list)