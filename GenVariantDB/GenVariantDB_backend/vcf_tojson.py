import pandas as pd
import json

def vcf_to_json(input):
    print ("Processing file: ", input)
    #read in vcf file as pd
    df = pd.read_csv(input, sep="\t", header=None)

    for index, row in df.iterrows():
        if row[0] == "#CHROM":
            df = df.iloc[index:]
            df = df.set_axis(labels = df.iloc[0], axis = 1).reset_index().drop(labels=["index"], axis = 1)
            df.drop(index = 0, inplace=True)
            df.columns.name = None
            break

    #Isolate patient name
    patient_name = df.columns[-1]

    #isolate the variant-level information from df and convert to dictionary
    variant = df.loc[:,:"FILTER"].drop(labels="POS", axis=1).reset_index(drop=True)
    variant_dict = variant.to_dict(orient="records")

    #isolate info section and split by delimiter
    info = df["INFO"]
    split_info = info.str.split(";").to_list()

    #build a list of dictionaries to carry key value pairs of info
    def split_pairs(all_info):
        dictionary_list = []
        
        for i in range(len(all_info)):
            dictionary = {}
            for pair in all_info[i]:
                try:
                    key,value = pair.split("=")
                    dictionary[key] = value
                except ValueError:
                    key = "Exon"
                    value = pair
                    dictionary[key] = value
                    continue
            dictionary_list.append(dictionary)
        return (dictionary_list)

    string_dict = split_pairs(split_info)

    #Convert numerical data from string
    def convert_int(all_dict):
        int_dict_list = []
        
        for i in range(len(all_dict)):
            int_dict = {}
            dict = all_dict[i]
            for key, value in dict.items():
                try:
                    int_value = float(value)
                    int_dict[key] = int_value
                except (ValueError, TypeError):
                    int_dict[key] = value
                    continue
            int_dict_list.append(int_dict)
        return (int_dict_list)

    int_dict = convert_int(string_dict)

    #Join variant and INFO data together for each variant
    def attach_section(input, section, col_index):
        for i in range(len(input)):
            input[i][col_index] = section[i]
        return(input)

    #attach sections
    patient = attach_section(variant_dict, int_dict, "INFO")

    #isolate the format section and attach the keys to values
    format = pd.DataFrame(df.iloc[:, -2:])

    format_label = str(format.iloc[0,0])
    format_label = format_label.split(":")
    format_values = format.iloc[:,1].str.split(":").to_list()

    def format_dict(keys, values):
        format_dict_list = []
        for i in range(len(values)):
            format_dict = {key: value for key, value in zip(keys, values[i])}
            for key, value in format_dict.items():
                if "," in value:
                    value = value.split(",")
                    value = [float(x) for x in value]
                    #print(value)
                    format_dict[key] = value
            format_dict_list.append(format_dict)
        return(format_dict_list)

    format_json = format_dict(format_label, format_values)

    format_json_int = convert_int(format_json)

    #join the format section to the rest of the data for each variant
    patient = attach_section(patient, format_json_int, "FORMAT")

    named_vars = {"pName":patient_name, "variants":patient}

    print("processing complete")
    #write data out to json file
    return json.dumps(named_vars)