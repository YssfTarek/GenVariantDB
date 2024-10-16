from io import StringIO
import pandas as pd

def read_vcf(vcf_file):
    header_line = None
    data_lines = []

    #read the file line by line
    for line in vcf_file:
        line = line.decode('utf-8')

        if line.startswith("#CHROM"):
            header_line = line.strip()
            continue

        if header_line:
            data_lines.append(line.strip())

    if not header_line:
        raise ValueError("No header line starting with #CHROM was found in file.")
    
    vcf_content = header_line + '\n' + '\n'.join(data_lines)

    df = pd.read_csv(StringIO(vcf_content), sep='\t', header=0)

    return df

def extract_var_info(vcf):
    info = vcf["INFO"]
    split_info = info.str.split(";").to_list()

    info_dict_list = []

    for i in range(len(split_info)):
        dictionary = {}
        for pair in split_info[i]:
            try:
                key, value = pair.split("=")
                dictionary[key] = value
            except ValueError:
                dictionary["Exon"] = pair
        info_dict_list.append(dictionary)

    info_int_dict_list = []
    
    for info_dict in info_dict_list:
        int_dict = {}
        for key, value in info_dict.items():
            try:
                int_dict[key] = float(value)
            except (ValueError, TypeError):
                int_dict[key] = value
                continue
        info_int_dict_list.append(int_dict)    
    return info_int_dict_list


def extract_format(vcf):
    format_data = vcf.iloc[:,-2:]
    format_labels = format_data.iloc[0, 0].split(":")
    format_values = format_data.iloc[:,1].str.split(":").to_list()

    format_dict_list = []
    
    for values in format_values:
        format_dict = {key: value for key, value in zip(format_labels, values)}
        for key, value in format_dict.items():
            if "," in value:
                value = [float(x) for x in value.split(",")]
            format_dict[key] = value
        format_dict_list.append(format_dict)


    return format_dict_list

def chunk_data(data, chunk_size):
    for i in range(0, len(data), chunk_size):
        yield data[i:i + chunk_size]

def prepare_variant_data(vcf_file):
    vcf = read_vcf(vcf_file)

    variants = vcf.loc[:, :"ALT"].to_dict(orient="records")
    qual = vcf[['QUAL', 'FILTER']].to_dict(orient="records")
    info = extract_var_info(vcf)
    format_data = extract_format(vcf)

    combined_data = []

    for i in range(len(variants)):
        combined_data.append({
            "variant": variants[i],
            "qual": qual[i],
            "info": info[i],
            "format": format_data[i]
        })

    return combined_data
