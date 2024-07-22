[
    {
        '$project': {
            'synonymous': {
                '$size': {
                    '$filter': {
                        'input': '$variants.INFO', 
                        'as': 'info', 
                        'cond': {
                            '$regexMatch': {
                                'input': '$$info.FC', 
                                'regex': '.*synonymous.*', 
                                'options': 'i'
                            }
                        }
                    }
                }
            }, 
            'missense': {
                '$size': {
                    '$filter': {
                        'input': '$variants.INFO', 
                        'as': 'info', 
                        'cond': {
                            '$regexMatch': {
                                'input': '$$info.FC', 
                                'regex': '.*missense.*', 
                                'options': 'i'
                            }
                        }
                    }
                }
            }, 
            'nonsense': {
                '$size': {
                    '$filter': {
                        'input': '$variants.INFO', 
                        'as': 'info', 
                        'cond': {
                            '$regexMatch': {
                                'input': '$$info.FC', 
                                'regex': '.*nonsense.*', 
                                'options': 'i'
                            }
                        }
                    }
                }
            }, 
            'insertion': {
                '$size': {
                    '$filter': {
                        'input': '$variants.INFO', 
                        'as': 'info', 
                        'cond': {
                            '$regexMatch': {
                                'input': '$$info.FC', 
                                'regex': '.*insertion.*', 
                                'options': 'i'
                            }
                        }
                    }
                }
            }, 
            'deletion': {
                '$size': {
                    '$filter': {
                        'input': '$variants.INFO', 
                        'as': 'info', 
                        'cond': {
                            '$regexMatch': {
                                'input': '$$info.FC', 
                                'regex': '.*deletion.*', 
                                'options': 'i'
                            }
                        }
                    }
                }
            }, 
            'silent': {
                '$size': {
                    '$filter': {
                        'input': '$variants.INFO', 
                        'as': 'info', 
                        'cond': {
                            '$regexMatch': {
                                'input': '$$info.FC', 
                                'regex': '.*silent.*', 
                                'options': 'i'
                            }
                        }
                    }
                }
            }, 
            'frameshift': {
                '$size': {
                    '$filter': {
                        'input': '$variants.INFO', 
                        'as': 'info', 
                        'cond': {
                            '$regexMatch': {
                                'input': '$$info.FC', 
                                'regex': '.*frameshift.*', 
                                'options': 'i'
                            }
                        }
                    }
                }
            }
        }
    }, {
        '$group': {
            '_id': None, 
            'totalSynonymous': {
                '$sum': '$synonymous'
            }, 
            'totalMissense': {
                '$sum': '$missense'
            }, 
            'totalNonsense': {
                '$sum': '$nonsense'
            }, 
            'totalInsertion': {
                '$sum': '$insertion'
            }, 
            'totalDeletion': {
                '$sum': '$deletion'
            }, 
            'totalSilent': {
                '$sum': '$silent'
            }, 
            'totalFrameshift': {
                '$sum': '$frameshift'
            }
        }
    }
]